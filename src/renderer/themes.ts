// Banner colour themes, shared by the overlay (rendering) and settings (picker).
// Only the free "classic" theme ships in this open-source build; the Pro build
// adds more themes on top, gated by the license in the main process.
export type Theme = {
  id: string
  name: string
  free: boolean
  a: string // stripe colour A
  b: string // stripe colour B
  text: string // banner text colour
}

export const THEMES: Theme[] = [
  { id: 'classic', name: 'Classic', free: true, a: '#ffffff', b: '#ffe24d', text: '#1a1a1a' }
]

export function themeById(id: string | undefined): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}
