"""Build vector leg parts whose textures are clipped by shared SVG masks."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "assets/legs"

VARIANTS = {
    "bare": {
        "base": "#f0c5b2",
        "light": "#ffe2d0",
        "shadow": "#dda293",
        "accent": "#fff0e6",
    },
    "black-stockings": {
        "base": "#28315a",
        "light": "#52699b",
        "shadow": "#20284b",
        "accent": "#7589bb",
    },
    "white-stockings": {
        "base": "#e6e6f0",
        "light": "#f8f7fc",
        "shadow": "#c7c7dc",
        "accent": "#ffffff",
    },
}

def svg_document(view_box: str, body: str) -> str:
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view_box}">
  {body}
</svg>
'''


def material_defs(colors: dict[str, str], mask_path: str) -> str:
    return f'''<defs>
    <linearGradient id="material" x1="0" y1="0" x2="0.75" y2="1">
      <stop offset="0" stop-color="{colors['shadow']}"/>
      <stop offset="0.3" stop-color="{colors['base']}"/>
      <stop offset="0.7" stop-color="{colors['light']}"/>
      <stop offset="1" stop-color="{colors['base']}"/>
    </linearGradient>
    <linearGradient id="shine" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="{colors['accent']}" stop-opacity="0"/>
      <stop offset="0.55" stop-color="{colors['accent']}" stop-opacity="0.72"/>
      <stop offset="1" stop-color="{colors['accent']}" stop-opacity="0"/>
    </linearGradient>
    <mask id="shape"><rect width="100%" height="100%" fill="black"/><path d="{mask_path}" fill="white"/></mask>
  </defs>'''


def thigh_svg(colors: dict[str, str]) -> str:
    path = "M2 8C5 3 11 1 18 2C27 3 36 5 43 8C46 10 46 14 42 17C35 21 27 18 19 18C12 18 7 21 3 19C0 17 0 11 2 8Z"
    body = f'''{material_defs(colors, path)}
  <g mask="url(#shape)">
    <rect width="46" height="24" fill="url(#material)"/>
    <ellipse cx="23" cy="7" rx="14" ry="4" fill="url(#shine)" opacity="0.5"/>
  </g>'''
    return svg_document("0 0 46 24", body)


def calf_svg(colors: dict[str, str]) -> str:
    path = "M5 2C10-1 18 0 20 5C22 11 19 19 17 27C15 34 15 42 12 49C10 52 5 51 4 47C3 42 5 34 4 28C3 20 1 12 2 7C2 5 3 3 5 2Z"
    body = f'''{material_defs(colors, path)}
  <g mask="url(#shape)">
    <rect width="24" height="54" fill="url(#material)"/>
    <path d="M15 4C12 17 14 31 10 47" fill="none" stroke="url(#shine)" stroke-width="4" stroke-linecap="round" opacity="0.45"/>
  </g>'''
    return svg_document("0 0 24 54", body)


def main() -> None:
    for name, colors in VARIANTS.items():
        directory = OUTPUT / name
        directory.mkdir(parents=True, exist_ok=True)
        (directory / "thigh.svg").write_text(thigh_svg(colors), encoding="utf-8")
        (directory / "calf.svg").write_text(calf_svg(colors), encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
