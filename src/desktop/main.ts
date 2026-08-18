import { app, BrowserWindow, dialog, Menu, nativeImage, screen, Tray } from 'electron'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPetServer, type RunningPetServer } from '../server/index.js'

let runtime: RunningPetServer | undefined
let petWindow: BrowserWindow | undefined
let tray: Tray | undefined
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
  let petUrl = 'http://127.0.0.1:47832'
  try {
    runtime = await createPetServer({ host: '127.0.0.1', port: 47832, stateFile: join(homedir(), '.deepseek-token-pet-state.json'), packageRoot })
    petUrl = runtime.url
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error
  }

  const initialWidth = 440
  const initialHeight = 290
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
  petWindow.show()
}

function createTray(packageRoot: string): void {
  const iconPath = join(packageRoot, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png')
  let icon = nativeImage.createFromPath(iconPath)
  if (icon.isEmpty()) icon = nativeImage.createFromPath(process.execPath)
  tray = new Tray(icon)
  tray.setToolTip('DeepSeek Token Pet')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示 / 隐藏桌宠', click: togglePetWindow },
    { type: 'separator' },
    { label: '退出', click: quitFromTray },
  ]))
  tray.on('click', togglePetWindow)
}

function togglePetWindow(): void {
  if (petWindow === undefined) return
  if (petWindow.isVisible()) petWindow.hide()
  else {
    petWindow.show()
    petWindow.focus()
  }
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
  tray?.destroy()
  tray = undefined
  void runtime?.close()
})
app.on('window-all-closed', () => { /* The tray owns the application lifetime. */ })
