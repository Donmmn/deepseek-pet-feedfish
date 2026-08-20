import { app, BrowserWindow, dialog, Menu, nativeImage, screen, Tray } from 'electron'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPetServer, type RunningPetServer } from '../server/index.js'

let runtime: RunningPetServer | undefined
let petWindow: BrowserWindow | undefined
let tray: Tray | undefined
let trayTimer: ReturnType<typeof setInterval> | undefined
let trayUnsubscribe: (() => void) | undefined
let quitting = false

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
  const writableRoot = process.env.PORTABLE_EXECUTABLE_DIR ?? packageRoot
  const skinRoot = join(writableRoot, 'skin')
  let petUrl = 'http://127.0.0.1:47832'
  try {
    runtime = await createPetServer({ host: '127.0.0.1', port: 47832, stateFile: join(homedir(), '.deepseek-token-pet-state.json'), packageRoot, skinRoot })
    petUrl = runtime.url
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error
  }

  // macOS menu bar app: hide from Dock and stay alive in the status bar.
  app.dock?.hide()

  const initialWidth = 440
  const initialHeight = 370
  const workArea = screen.getPrimaryDisplay().workArea

  petWindow = new BrowserWindow({
    x: workArea.x + workArea.width - initialWidth - 16,
    y: workArea.y + workArea.height - initialHeight - 16,
    width: initialWidth,
    height: initialHeight,
    minWidth: 264,
    minHeight: 174,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    hasShadow: false,
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true },
  })
  petWindow.setAlwaysOnTop(true, 'floating')
  petWindow.on('close', event => {
    if (quitting) return
    event.preventDefault()
    petWindow?.hide()
  })
  await petWindow.loadURL(`${petUrl}/?desktop=1`)
  createTray(packageRoot)
  refreshTrayMenu()
  trayUnsubscribe = runtime?.onState(() => refreshTrayMenu())
  trayTimer = setInterval(refreshTrayMenu, 30_000)
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

function createTray(packageRoot: string): void {
  const iconPath = join(packageRoot, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png')
  let icon = nativeImage.createFromPath(iconPath)
  if (icon.isEmpty()) icon = nativeImage.createFromPath(process.execPath)
  tray = new Tray(icon)
  tray.setToolTip('DeepSeek Token Pet')
  tray.on('click', toggleWindow)
}

function refreshTrayMenu(): void {
  if (tray === undefined) return
  tray.setToolTip(`DeepSeek Token Pet — ${trayStatusLabel()}`)
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: trayStatusLabel(), enabled: false },
    { type: 'separator' },
    { label: '显示/隐藏桌宠', click: toggleWindow },
    { type: 'separator' },
    { label: '退出 DeepSeek Token Pet', click: quitFromTray },
  ]))
}

function quitFromTray(): void {
  quitting = true
  app.quit()
}

function showStartupError(error: unknown): void {
  const message = error instanceof Error ? `${error.message}\n\n${error.stack ?? ''}` : String(error)
  dialog.showErrorBox('DeepSeek Token Pet 启动失败', message)
  app.quit()
}

app.on('before-quit', () => {
  quitting = true
  if (trayTimer !== undefined) clearInterval(trayTimer)
  trayUnsubscribe?.()
  tray?.destroy()
  tray = undefined
  void runtime?.close()
})
app.on('window-all-closed', () => {
  // The tray owns the application lifetime.
})
