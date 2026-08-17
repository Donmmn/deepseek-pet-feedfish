import { app, BrowserWindow, dialog } from 'electron'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPetServer, type RunningPetServer } from '../server/index.js'

let runtime: RunningPetServer | undefined
let petWindow: BrowserWindow | undefined

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
  petWindow.show()
}

function showStartupError(error: unknown): void {
  const message = error instanceof Error ? `${error.message}\n\n${error.stack ?? ''}` : String(error)
  dialog.showErrorBox('DeepSeek Token Pet 启动失败', message)
  app.quit()
}

app.on('before-quit', () => { void runtime?.close() })
app.on('window-all-closed', () => app.quit())
