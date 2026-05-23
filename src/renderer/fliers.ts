// The flier is composed: a CHARACTER HEAD placed on a coloured PLANE.
// In this open-source build only the free Duck head + Red plane ship. The Pro
// build adds more heads/colours (and their artwork) on top, gated by the license
// in the main process. Shared by the overlay (rendering) and settings (pickers).
// `sound` is the soundPack id auto-selected when this head is chosen.
export type Head = { id: string; name: string; free: boolean; sound: string }
export type PlaneColor = { id: string; name: string; free: boolean }

export const HEADS: Head[] = [{ id: 'duck', name: 'Duck', free: true, sound: 'quack' }]

export const PLANE_COLORS: PlaneColor[] = [{ id: 'red', name: 'Red', free: true }]

export function headById(id: string | undefined): Head {
  return HEADS.find((h) => h.id === id) ?? HEADS[0]
}
export function colorById(id: string | undefined): PlaneColor {
  return PLANE_COLORS.find((c) => c.id === id) ?? PLANE_COLORS[0]
}
