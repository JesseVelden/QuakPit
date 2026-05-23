// Flier image URLs (resolved & bundled by Vite). Shared by overlay + settings.
// All 1088×1088, aligned. The flier is composed as:
//   plane base (blade removed) + character head + spinning blade (shared).
// This open-source build ships only the free Duck head + Red plane art; the Pro
// build adds the other heads/colours (and their PNGs) on top.
import blade from './overlay/blade.png'
// Cropped full plane (static blade) — used for the colour tile.
import planeRed from './overlay/thumb-plane-red.png'
// Bladeless base — used for the composed flier (so the blade can spin on top).
import baseRed from './overlay/plane-red-base.png'
// Head, full-canvas (for composing) + tight thumbnail (for the head tile).
import headDuck from './overlay/head-duck.png'
import thumbDuck from './overlay/thumb-head-duck.png'

export const BLADE_URL = blade

const PLANE_URL: Record<string, string> = {
  red: planeRed
}
const PLANE_BASE_URL: Record<string, string> = {
  red: baseRed
}
const HEAD_URL: Record<string, string> = {
  duck: headDuck
}
const HEAD_THUMB_URL: Record<string, string> = {
  duck: thumbDuck
}

export const planeUrl = (id: string | undefined): string => PLANE_URL[id ?? 'red'] ?? PLANE_URL.red
export const planeBaseUrl = (id: string | undefined): string =>
  PLANE_BASE_URL[id ?? 'red'] ?? PLANE_BASE_URL.red
export const headUrl = (id: string | undefined): string => HEAD_URL[id ?? 'duck'] ?? HEAD_URL.duck
export const headThumbUrl = (id: string | undefined): string =>
  HEAD_THUMB_URL[id ?? 'duck'] ?? HEAD_THUMB_URL.duck
