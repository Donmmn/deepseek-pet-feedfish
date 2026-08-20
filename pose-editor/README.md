# 骨骼姿势编辑器

这是仓库内的独立动画制作工具，用于调整双腿骨骼基准姿势、预览循环动画，并导出 `deepseek-token-pet/leg-pose@2` JSON。它不连接 token 服务，也不会打进 npm 包或桌面 EXE。

## 启动

在 Windows 下双击 `start-pose-editor.cmd`，或在仓库根目录运行：

```powershell
pnpm pose:edit
```

默认地址为 `http://127.0.0.1:47833/`。如需使用其他端口：

```powershell
pnpm pose:edit -- --port 47834 --no-open
```

编辑结果保存在当前浏览器的本地存储中。点击“复制 JSON”即可把姿势配置交给运行时代码；“恢复当前默认”会回到代码内置的已验证基准。

## 目录内容

- `pose-editor-page.ts`：编辑器页面、Canvas 渲染与交互逻辑；
- `pose-editor-server.ts`：只为编辑器提供页面和仓库素材的本地服务器；
- `start-pose-editor.cmd`：Windows 双击启动入口。

桌面软件的打包白名单只包含 `dist/`、运行素材、`skin/` 和 `package.json`，因此此目录只保留在源码仓库中。
