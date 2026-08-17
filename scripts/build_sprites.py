"""Normalize generated sources into fixed, hard-edged runtime pixel sheets."""

from pathlib import Path
from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parents[1]


def keep_largest_alpha_component(image: Image.Image) -> None:
    alpha = image.getchannel("A")
    visible = {(x, y) for y in range(image.height) for x in range(image.width) if alpha.getpixel((x, y)) >= 128}
    components: list[set[tuple[int, int]]] = []
    while visible:
        seed = visible.pop()
        component = {seed}
        stack = [seed]
        while stack:
            x, y = stack.pop()
            for neighbor in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if neighbor in visible:
                    visible.remove(neighbor)
                    component.add(neighbor)
                    stack.append(neighbor)
        components.append(component)
    if not components:
        return
    largest = max(components, key=len)
    image.putalpha(Image.new("L", image.size, 0))
    output_alpha = image.getchannel("A")
    for point in largest:
        output_alpha.putpixel(point, 255)
    image.putalpha(output_alpha)


def normalize_strip(source: Path, output: Path, cell: int, padding: int, colors: int, largest_only: bool = False) -> Image.Image:
    image = Image.open(source).convert("RGBA")
    slot_width = image.width // 4
    crops: list[Image.Image] = []
    bounds: list[tuple[int, int]] = []
    for index in range(4):
        slot = image.crop((index * slot_width, 0, (index + 1) * slot_width, image.height))
        # A hard 50% cutoff removes low-alpha chroma remnants before bounding;
        # final sprites intentionally use binary alpha for true pixel edges.
        alpha = slot.getchannel("A").point(lambda value: 255 if value >= 128 else 0)
        bbox = alpha.getbbox()
        if bbox is None:
            raise RuntimeError(f"empty frame {index} in {source}")
        crop = slot.crop(bbox)
        crops.append(crop)
        bounds.append(crop.size)

    max_width = max(size[0] for size in bounds)
    max_height = max(size[1] for size in bounds)
    scale = min((cell - padding * 2) / max_width, (cell - padding * 2) / max_height)
    sheet = Image.new("RGBA", (cell * 4, cell), (0, 0, 0, 0))
    for index, crop in enumerate(crops):
        width = max(1, round(crop.width * scale))
        height = max(1, round(crop.height * scale))
        sprite = crop.resize((width, height), Image.Resampling.NEAREST)
        quantized = sprite.quantize(colors=colors, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).convert("RGBA")
        source_alpha = sprite.getchannel("A").point(lambda value: 255 if value >= 128 else 0)
        quantized.putalpha(source_alpha)
        if largest_only:
            keep_largest_alpha_component(quantized)
        x = index * cell + (cell - width) // 2
        y = cell - padding - height
        sheet.alpha_composite(quantized, (x, y))
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output, optimize=True)
    return sheet


def checkerboard(size: tuple[int, int], unit: int = 8) -> Image.Image:
    image = Image.new("RGBA", size, "#dbe9ff")
    draw = ImageDraw.Draw(image)
    for y in range(0, size[1], unit):
        for x in range(0, size[0], unit):
            if (x // unit + y // unit) % 2:
                draw.rectangle((x, y, x + unit - 1, y + unit - 1), fill="#b8cbed")
    return image


def quantize_hard(image: Image.Image, colors: int) -> Image.Image:
    alpha = image.getchannel("A").point(lambda value: 255 if value >= 128 else 0)
    output = image.quantize(colors=colors, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).convert("RGBA")
    output.putalpha(alpha)
    return output


def chroma_key_magenta(source: Path, output: Path) -> Image.Image:
    """Turn ImageGen's flat magenta staging color into binary transparency."""
    image = Image.open(source).convert("RGBA")
    pixels = []
    for red, green, blue, source_alpha in image.get_flattened_data():
        is_chroma = red >= 180 and blue >= 180 and min(red, blue) - green >= 90
        pixels.append((red, green, blue, 0 if is_chroma else (255 if source_alpha >= 128 else 0)))
    image.putdata(pixels)
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output, optimize=True)
    return image


def build_aligned_grid_rows(source: Path, cell: int = 128) -> tuple[Image.Image, Image.Image]:
    """Build two aligned four-frame rows in memory while preserving registration."""
    image = Image.open(source).convert("RGBA")
    source_cell_width = image.width // 4
    source_cell_height = image.height // 2
    slots: list[Image.Image] = []
    bounds: list[tuple[int, int, int, int]] = []
    for row in range(2):
        for column in range(4):
            slot = image.crop((column * source_cell_width, row * source_cell_height, (column + 1) * source_cell_width, (row + 1) * source_cell_height))
            slot.putalpha(slot.getchannel("A").point(lambda value: 255 if value >= 128 else 0))
            bbox = slot.getchannel("A").getbbox()
            if bbox is None:
                raise RuntimeError(f"empty atlas cell {row},{column} in {source}")
            slots.append(slot)
            bounds.append(bbox)

    shared = (
        min(box[0] for box in bounds), min(box[1] for box in bounds),
        max(box[2] for box in bounds), max(box[3] for box in bounds),
    )
    shared_width = shared[2] - shared[0]
    shared_height = shared[3] - shared[1]
    scale = min((cell - 4) / shared_width, (cell - 4) / shared_height)
    width = max(1, round(shared_width * scale))
    height = max(1, round(shared_height * scale))
    sheets = [Image.new("RGBA", (cell * 4, cell), (0, 0, 0, 0)) for _ in range(2)]
    for index, slot in enumerate(slots):
        sprite = quantize_hard(slot.crop(shared).resize((width, height), Image.Resampling.NEAREST), 24)
        x = (index % 4) * cell + (cell - width) // 2
        y = cell - 2 - height
        sheets[index // 4].alpha_composite(sprite, (x, y))
    return sheets[0], sheets[1]


def build_character_layers(source: Path) -> tuple[Image.Image, Image.Image, Image.Image, list[Image.Image]]:
    """Split an atlas into 96px logical-pixel layers for display and future TUI use."""
    cell = 96
    full_idle, full_feed = build_aligned_grid_rows(source, cell)

    body = full_idle.crop((0, 0, cell, cell))
    body_cutout = Image.new("L", (cell, cell), 0)
    ImageDraw.Draw(body_cutout).ellipse((8, 9, 56, 60), fill=255)
    body.putalpha(ImageChops.subtract(body.getchannel("A"), body_cutout))
    body_path = ROOT / "assets/character-body.png"
    body.save(body_path, optimize=True)

    face_mask = Image.new("L", (cell, cell), 0)
    ImageDraw.Draw(face_mask).ellipse((6, 6, 57, 62), fill=255)
    face_sheets: list[Image.Image] = []
    composed: list[Image.Image] = []
    for name, full_sheet in (("idle", full_idle), ("feed", full_feed)):
        face_sheet = Image.new("RGBA", (cell * 4, cell), (0, 0, 0, 0))
        for index in range(4):
            frame = full_sheet.crop((index * cell, 0, (index + 1) * cell, cell))
            frame.putalpha(ImageChops.multiply(frame.getchannel("A"), face_mask))
            face_sheet.alpha_composite(frame, (index * cell, 0))
            composite = body.copy()
            composite.alpha_composite(frame)
            composed.append(composite)
        face_sheet.save(ROOT / f"assets/character-face-{name}.png", optimize=True)
        face_sheets.append(face_sheet)
    return body, face_sheets[0], face_sheets[1], composed


def build_food_dlc(source: Path, output_directory: Path) -> list[Path]:
    """Split an eight-dish atlas into weighted single-image 48x48 food sprites."""
    image = Image.open(source).convert("RGBA")
    source_cell_width = image.width // 4
    source_cell_height = image.height // 2
    definitions = (
        ("tomato-egg{6}.png", 0, 0),
        ("chicken-curry{5}.png", 0, 1),
        ("braised-beef{4}.png", 0, 2),
        ("yuxiang-pork{4}.png", 0, 3),
        ("mapo-tofu{5}.png", 1, 0),
        ("teriyaki-chicken{4}.png", 1, 1),
        ("green-pepper-pork{3}.png", 1, 2),
        ("char-siu-egg{3}.png", 1, 3),
    )
    outputs: list[Path] = []
    for filename, row, column in definitions:
        slot = image.crop((column * source_cell_width, row * source_cell_height, (column + 1) * source_cell_width, (row + 1) * source_cell_height))
        slot.putalpha(slot.getchannel("A").point(lambda value: 255 if value >= 128 else 0))
        bbox = slot.getchannel("A").getbbox()
        if bbox is None:
            raise RuntimeError(f"empty food atlas cell {row},{column} in {source}")
        crop = slot.crop(bbox)
        scale = min(44 / crop.width, 44 / crop.height)
        width = max(1, round(crop.width * scale))
        height = max(1, round(crop.height * scale))
        sprite = quantize_hard(crop.resize((width, height), Image.Resampling.NEAREST), 24)
        sheet = Image.new("RGBA", (48, 48), (0, 0, 0, 0))
        x = (48 - width) // 2
        y = 48 - 2 - height
        sheet.alpha_composite(sprite, (x, y))
        output = output_directory / filename
        output.parent.mkdir(parents=True, exist_ok=True)
        sheet.save(output, optimize=True)
        outputs.append(output)
    return outputs


def main() -> None:
    core_food = ROOT / "assets/foods/core/plain-rice{10}.png"
    core_food.parent.mkdir(parents=True, exist_ok=True)
    bowl_strip = normalize_strip(ROOT / "assets/source/rice-bowl-strip-alpha.png", core_food, 48, 2, 16, largest_only=True)
    bowl = bowl_strip.crop((0, 0, 48, 48))
    bowl.save(core_food, optimize=True)
    body, idle_faces, feed_faces, composed = build_character_layers(ROOT / "assets/source/character-layered-atlas-v4-alpha.png")
    foods = build_food_dlc(ROOT / "assets/source/food-dlc-donburi-atlas-v1-alpha.png", ROOT / "assets/foods/dlc-gaijiaofan")
    icon_frame = composed[0].resize((256, 256), Image.Resampling.NEAREST)
    icon_frame.save(ROOT / "assets/icon.png", optimize=True)
    icon_frame.save(ROOT / "assets/icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    preview = checkerboard((96 * 4 * 3, 96 * 8 + 320))
    for index, frame in enumerate(composed):
        x = (index % 4) * 96 * 3
        y = (index // 4) * 96 * 3
        preview.alpha_composite(frame.resize((96 * 3, 96 * 3), Image.Resampling.NEAREST), (x, y))
    food_y = 96 * 6 + 24
    preview.alpha_composite(bowl.resize((48 * 3, 48 * 3), Image.Resampling.NEAREST), (0, food_y))
    for index, food_path in enumerate(foods):
        food = Image.open(food_path).convert("RGBA")
        x = (index % 4) * food.width * 2
        y = food_y + 48 * 3 + (index // 4) * food.height * 2
        preview.alpha_composite(food.resize((food.width * 2, food.height * 2), Image.Resampling.NEAREST), (x, y))
    qa = ROOT / "assets/qa/sprites-preview.png"
    qa.parent.mkdir(parents=True, exist_ok=True)
    preview.save(qa, optimize=True)


if __name__ == "__main__":
    main()
