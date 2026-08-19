# 皮肤包目录

把符合 `deepseek-token-pet/skin@1` 结构的 ZIP 放在本目录或任意子目录中，然后打开桌宠设置，点击“重新扫描”和“安装并启用”。

安装器只会把 ZIP 解压到 `skin/installed/<皮肤 ID>/`，不会覆盖程序内置的 `assets/`。运行时按素材项逐个回退：皮肤包未提供或替换目录中缺少某项时，继续使用默认素材。

ZIP 根目录必须直接包含 `manifest.json`：

```text
my-skin.zip
├── manifest.json
└── assets/
    ├── body.png
    ├── face-idle.png
    ├── face-feed.png
    ├── thigh.svg
    ├── calf.svg
    ├── foot.png
    └── shoe.png
```

最小清单示例：

```json
{
  "schema": "deepseek-token-pet/skin@1",
  "id": "my-skin",
  "name": "My Skin",
  "version": "1.0.0",
  "appendageMode": "legs",
  "legStyle": "black-stockings",
  "assets": {
    "body": "assets/body.png",
    "faceIdle": "assets/face-idle.png",
    "faceFeed": "assets/face-feed.png",
    "thigh": "assets/thigh.svg",
    "calf": "assets/calf.svg",
    "foot": "assets/foot.png",
    "shoe": "assets/shoe.png"
  }
}
```

`assets` 中所有字段都可省略。身体、表情表、脚掌及鞋面必须是透明 PNG；大腿和小腿继续使用 SVG。内置脚掌与鞋面规格为 `48×28`，左侧为踝关节截面，活动关节不包含任何小腿部分。脚与鞋建议使用二值 Alpha（像素只能完全透明或完全不透明），避免远端脚出现半透明边缘。`foot`/`shoe` 会同时作为前后脚回退素材；需要区分透视时可另填 `footFar`、`footNear`、`shoeFar`、`shoeNear`。鞋面是透明覆盖层，运行时顺序为远端脚掌→远端鞋面→近端脚掌→近端鞋面；建议替换素材保持相同踝点、画布规格和透明边距。
