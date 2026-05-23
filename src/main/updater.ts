import { app, dialog } from 'electron'
import { autoUpdater } from 'electron-updater'

const CHECK_INTERVAL = 6 * 60 * 60 * 1000

// Set true to make updates mandatory (no "Later" — the app restarts to update).
const FORCE_UPDATE = false

/**
 * Checks GitHub Releases for updates, downloads them in the background, and
 * prompts the user to restart. No-ops in development, and on macOS only works
 * for a SIGNED + notarized build (Squirrel.Mac requirement).
 * The release feed comes from the `publish:` block in electron-builder.yml.
 */
export function initAutoUpdate(): void {
  if (!app.isPackaged) return

  try {
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.on('update-downloaded', (info) => {
      const buttons = FORCE_UPDATE ? ['Restart now'] : ['Restart now', 'Later']
      void dialog
        .showMessageBox({
          type: 'info',
          buttons,
          defaultId: 0,
          cancelId: FORCE_UPDATE ? 0 : 1,
          title: 'Update available',
          message: `Quakpit ${info.version} is ready 🦆`,
          detail: FORCE_UPDATE
            ? 'A required update has been downloaded. Quakpit will restart to update.'
            : 'A new version has been downloaded. Restart Quakpit to update — or it will update next time you quit.'
        })
        .then((r) => {
          if (FORCE_UPDATE || r.response === 0) autoUpdater.quitAndInstall()
        })
    })

    autoUpdater.on('error', () => undefined)

    void autoUpdater.checkForUpdates().catch(() => undefined)
    setInterval(() => {
      void autoUpdater.checkForUpdates().catch(() => undefined)
    }, CHECK_INTERVAL)
  } catch {
    // Updates are best-effort; never block the app over them.
  }
}
