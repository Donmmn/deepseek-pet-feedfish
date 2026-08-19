import { app, BrowserWindow, dialog, Menu, nativeImage, Tray } from 'electron'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPetServer, type RunningPetServer } from '../server/index.js'

let runtime: RunningPetServer | undefined
let petWindow: BrowserWindow | undefined
let tray: Tray | undefined
let trayTimer: ReturnType<typeof setInterval> | undefined

const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (petWindow === undefined) return
    if (petWindow.isMinimized()) petWindow.restore()
    petWindow.show()
    petWindow.focus()
  })

  // Do not await app.whenReady() at module top level. Electron loads ESM main
  // modules asynchronously, and a top-level wait can prevent the ready event
  // from being delivered in a packaged build.
  void app.whenReady().then(startDesktop).catch(showStartupError)
}

async function startDesktop(): Promise<void> {
  const packageRoot = fileURLToPath(new URL('../../', import.meta.url))
  let petUrl = 'http://127.0.0.1:47832'
  try {
    runtime = await createPetServer({ host: '127.0.0.1', port: 47832, stateFile: join(homedir(), '.deepseek-token-pet-state.json'), packageRoot })
    petUrl = runtime.url
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error
  }

  // macOS menu bar app: hide from Dock and stay alive in the status bar.
  app.dock?.hide()

  petWindow = new BrowserWindow({
    width: 440,
    height: 258,
    minWidth: 264,
    minHeight: 155,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: true,
    hasShadow: false,
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true },
  })
  petWindow.setAlwaysOnTop(true, 'floating')
  await petWindow.loadURL(`${petUrl}/?desktop=1`)
  setupTray(packageRoot)
  trayTimer = setInterval(refreshTrayMenu, 5000)
  petWindow.show()
}

function toggleWindow(): void {
  if (petWindow === undefined) return
  if (petWindow.isVisible()) {
    petWindow.hide()
  } else {
    petWindow.show()
    petWindow.focus()
  }
}

function trayStatusLabel(): string {
  return runtime?.state().dshConnected === true ? 'DSH 插件：已连接' : 'DSH 插件：未连接'
}

function refreshTrayMenu(): void {
  if (tray === undefined) return
  tray.setToolTip(`DeepSeek Token Pet — ${trayStatusLabel()}`)
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: trayStatusLabel(), enabled: false },
    { type: 'separator' },
    { label: '显示/隐藏桌宠', click: toggleWindow },
    { type: 'separator' },
    { label: '退出 DeepSeek Token Pet', click: () => app.quit() },
  ]))
}

function setupTray(packageRoot: string): void {
  const icon = nativeImage.createEmpty()
  icon.addRepresentation({ scaleFactor: 1, buffer: readFileSync(join(packageRoot, 'assets', 'tray-icon.png')) })
  icon.addRepresentation({ scaleFactor: 2, buffer: readFileSync(join(packageRoot, 'assets', 'tray-icon@2x.png')) })
  icon.setTemplateImage(true)

  tray = new Tray(icon)
  tray.on('click', toggleWindow)
  refreshTrayMenu()
}

function showStartupError(error: unknown): void {
  const message = error instanceof Error ? `${error.message}\n\n${error.stack ?? ''}` : String(error)
  dialog.showErrorBox('DeepSeek Token Pet 启动失败', message)
  app.quit()
}

app.on('before-quit', () => {
  if (trayTimer !== undefined) clearInterval(trayTimer)
  void runtime?.close()
})
app.on('window-all-closed', () => {
  // Keep the menu bar app alive when the pet window is closed manually.
})
