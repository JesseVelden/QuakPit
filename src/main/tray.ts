import { Tray, Menu, nativeImage, app } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

let tray: Tray | null = null

function resolveTrayIconPath(fileNames: string[]): string | undefined {
  const baseDirs = [
    join(app.getAppPath(), 'build'),
    join(process.resourcesPath, 'build'),
    join(__dirname, '../../build')
  ]

  for (const fileName of fileNames) {
    for (const baseDir of baseDirs) {
      const candidate = join(baseDir, fileName)
      if (existsSync(candidate)) return candidate
    }
  }

  return undefined
}

/** Creates the menu-bar / system-tray icon and its menu. */
export function createTray(onTestFlight: () => void, onSettings: () => void): Tray {
  const iconPath = resolveTrayIconPath(
    process.platform === 'win32' ? ['tray-icon.png', 'iconTemplate.png'] : ['iconTemplate.png']
  )
  // createFromPath automatically picks up the @2x variant when present.
  let image = iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty()
  if (image.isEmpty()) {
    image = nativeImage.createEmpty()
  }
  // Template image = macOS auto-adapts it to light/dark menu bars.
  if (process.platform === 'darwin') {
    image.setTemplateImage(true)
  }

  tray = new Tray(image)
  tray.setToolTip('Quakpit')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Quakpit', click: onSettings },
      { label: 'Send a test flight  (⌘⇧D)', click: onTestFlight },
      { type: 'separator' },
      { label: 'Quit Quakpit', click: () => app.quit() }
    ])
  )
  return tray
}
