import { app, BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import { getPrefs } from '../store'
import { isPremium } from '../license'

/**
 * Showing the transparent overlay can make macOS drop the app to "accessory"
 * (Dock icon disappears) in packaged builds. Re-assert the Dock icon so the app
 * always stays reachable. No-op when already visible (no flicker).
 */
function keepDockVisible(): void {
  if (process.platform !== 'darwin' || !app.dock) return
  void app.dock.show()
}

export type Flight = {
  message: string
  durationMs: number
  sound?: boolean
  soundPack?: string
  theme?: string
  head?: string // character head id
  color?: string // plane colour id
  font?: string
}

// Higher = faster crossing (shorter flight). Pro-only; free is always 'normal'.
const SPEED_MULT: Record<string, number> = { normal: 1, fast: 1.5, ultra: 2 }

let overlay: BrowserWindow | null = null
let ready = false
let pending: Flight | null = null

/**
 * Creates the transparent, click-through, always-on-top window that the plane
 * animation is drawn into, and keeps it shown permanently. It's fully transparent
 * and click-through (so invisible and non-blocking); a flight just triggers the
 * CSS animation. We never show/hide it per flight — that toggling is what hid the
 * settings window and dropped the Dock icon.
 */
export function createOverlayWindow(): BrowserWindow {
  const { bounds } = screen.getPrimaryDisplay()

  overlay = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    show: false,
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    // skipTaskbar is a Windows concept; on macOS it makes the app drop its Dock
    // icon (accessory mode) as soon as the overlay shows — so enable it on Windows only.
    skipTaskbar: process.platform === 'win32',
    focusable: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Let the synthesized engine sound play without a user gesture.
      autoplayPolicy: 'no-user-gesture-required'
    }
  })

  // Float above (almost) everything, on every space, including fullscreen apps.
  // 'floating' = above your app windows, but below the Dock & menu bar (so they
  // stay visible during a flight). 'screen-saver' would cover the whole screen.
  overlay.setAlwaysOnTop(true, 'floating')
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  // Never intercept clicks — let them pass through to the apps underneath.
  overlay.setIgnoreMouseEvents(true, { forward: true })

  overlay.webContents.on('did-finish-load', () => {
    ready = true
    if (pending) {
      overlay?.webContents.send('flight:start', pending)
      pending = null
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    overlay.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/overlay/index.html`)
  } else {
    overlay.loadFile(join(__dirname, '../renderer/overlay/index.html'))
  }

  // Show it once, for good (transparent + click-through). Re-assert the Dock so
  // this one-time show can't leave us in accessory mode.
  overlay.showInactive()
  keepDockVisible()
  setTimeout(keepDockVisible, 400)
  setTimeout(keepDockVisible, 1500)

  return overlay
}

/** Runs one flight: positions the (already-shown) overlay and triggers the animation. */
export function flyAcross(flight: Flight): void {
  try {
    if (!overlay || overlay.isDestroyed()) createOverlayWindow()
    if (!overlay) return

    // Banner theme, head + plane colour, custom sounds and flight speed are all
    // Pro — enforced here so the UI can't be bypassed. Typography is free.
    const prefs = getPrefs()
    const pro = isPremium()
    flight = {
      ...flight,
      theme: pro ? prefs.theme : 'classic',
      head: pro ? prefs.flierHead : 'duck',
      color: pro ? prefs.flierColor : 'red',
      soundPack: pro ? prefs.soundPack : 'quack',
      font: prefs.font,
      durationMs: Math.round(flight.durationMs / (pro ? (SPEED_MULT[prefs.speed] ?? 1) : 1))
    }

    // Re-fit the (already-visible) overlay to the chosen display, then animate.
    // setBounds on a shown window doesn't disturb other windows or the Dock.
    const display =
      prefs.targetDisplay === 'primary'
        ? screen.getPrimaryDisplay()
        : screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    overlay.setBounds(display.bounds)
    overlay.setAlwaysOnTop(true, 'floating')

    if (ready) {
      overlay.webContents.send('flight:start', flight)
    } else {
      pending = flight
    }
    keepDockVisible()
  } catch (err) {
    console.error('[flyAcross] failed (ignored):', err)
  }
}
