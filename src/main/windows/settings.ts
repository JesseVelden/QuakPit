import { app, BrowserWindow } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

let win: BrowserWindow | null = null

function resolveWindowIcon(): string | undefined {
  const candidates = [
    join(app.getAppPath(), 'build', 'icon.png'),
    join(process.resourcesPath, 'build', 'icon.png'),
    join(__dirname, '../../../build/icon.png')
  ]

  return candidates.find((candidate) => existsSync(candidate))
}

/** Opens (or focuses) the settings window. */
export function openSettings(): void {
  if (win && !win.isDestroyed()) {
    win.show()
    win.focus()
    return
  }

  win = new BrowserWindow({
    width: 780,
    height: 580,
    minWidth: 660,
    minHeight: 480,
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    title: 'Quakpit',
    icon: process.platform === 'win32' ? resolveWindowIcon() : undefined,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.on('ready-to-show', () => {
    win?.show()
    win?.focus()
    // Bring the app forward so the window is usable even from another Space/app.
    if (process.platform === 'darwin') app.focus({ steal: true })
  })
  win.on('closed', () => {
    win = null
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/settings/index.html`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/settings/index.html'))
  }
}
