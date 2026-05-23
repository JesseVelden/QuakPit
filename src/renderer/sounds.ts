// The signature sound that plays as the plane passes mid-screen. Only the free
// Duck "quack" ships in this open-source build; the Pro build adds per-animal
// sounds on top. Shared by the overlay (real flights) and settings (previews).
import quackUrl from './overlay/quack.wav'

export type SoundPack = { id: string; name: string; free: boolean }

export const SOUNDS: SoundPack[] = [{ id: 'quack', name: 'Duck', free: true }]

export function soundById(id: string | undefined): SoundPack {
  return SOUNDS.find((s) => s.id === id) ?? SOUNDS[0]
}

const URLS: Record<string, string> = {
  quack: quackUrl
}

const buffers: Record<string, AudioBuffer> = {}
const loading: Record<string, Promise<void>> = {}

/** Decodes one sample once and caches it. */
function load(ctx: AudioContext, id: string): Promise<void> {
  if (buffers[id]) return Promise.resolve()
  const url = URLS[id]
  if (!url) return Promise.resolve()
  if (!loading[id]) {
    loading[id] = fetch(url)
      .then((r) => r.arrayBuffer())
      .then((buf) => ctx.decodeAudioData(buf))
      .then((decoded) => {
        buffers[id] = decoded
      })
      .catch(() => {
        delete loading[id]
      })
  }
  return loading[id]
}

/** Warms up the default sample so the first flight isn't silent. */
export function preloadSounds(ctx: AudioContext): void {
  void load(ctx, 'quack')
}

/**
 * Plays the chosen animal sound. The sample loads asynchronously and plays as
 * soon as it's ready (never before `when`).
 */
export function playSound(ctx: AudioContext, id: string, when?: number, volume = 0.9): void {
  const at = when ?? ctx.currentTime
  void load(ctx, id).then(() => {
    const buffer = buffers[id]
    if (!buffer) return
    const src = ctx.createBufferSource()
    src.buffer = buffer
    const gain = ctx.createGain()
    gain.gain.value = volume
    src.connect(gain).connect(ctx.destination)
    src.start(Math.max(at, ctx.currentTime))
  })
}
