import { themeById } from '../themes'
import { fontById } from '../fonts'
import { playSound, preloadSounds } from '../sounds'
import { planeBaseUrl, headUrl, BLADE_URL } from '../flier-assets'

const flyer = document.getElementById('flyer') as HTMLDivElement
const banner = document.querySelector('.banner') as HTMLDivElement
const bannerText = document.getElementById('banner-text') as HTMLSpanElement
const planeImg = document.querySelector('.aircraft .plane') as HTMLImageElement
const headImg = document.querySelector('.aircraft .head') as HTMLImageElement
const propImg = document.querySelector('.aircraft .prop') as HTMLImageElement
propImg.src = BLADE_URL

let audioCtx: AudioContext | null = null

function ensureAudio(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext()
  if (audioCtx.state === 'suspended') void audioCtx.resume()
  preloadSounds(audioCtx)
  return audioCtx
}

/** A propeller-engine drone that fades in/out and pans left -> right. */
function startEngine(ctx: AudioContext, durationS: number): void {
  const now = ctx.currentTime

  const master = ctx.createGain()
  master.gain.setValueAtTime(0.0001, now)
  master.gain.exponentialRampToValueAtTime(0.16, now + 0.8)
  master.gain.setValueAtTime(0.16, Math.max(now + 0.8, now + durationS - 0.8))
  master.gain.exponentialRampToValueAtTime(0.0001, now + durationS)

  // Pan follows the plane across the screen.
  const panner = ctx.createStereoPanner()
  panner.pan.setValueAtTime(-0.9, now)
  panner.pan.linearRampToValueAtTime(0.9, now + durationS)
  master.connect(panner).connect(ctx.destination)

  // Two detuned saws -> lowpass -> tremolo gain (prop wobble) -> master.
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 850

  const wob = ctx.createGain()
  wob.gain.value = 1
  lp.connect(wob).connect(master)

  const lfo = ctx.createOscillator()
  lfo.type = 'sine'
  lfo.frequency.value = 11
  const lfoGain = ctx.createGain()
  lfoGain.gain.value = 0.07
  lfo.connect(lfoGain).connect(wob.gain)

  const o1 = ctx.createOscillator()
  o1.type = 'sawtooth'
  o1.frequency.value = 92
  const o2 = ctx.createOscillator()
  o2.type = 'sawtooth'
  o2.frequency.value = 92 * 1.012
  o1.connect(lp)
  o2.connect(lp)

  const stopAt = now + durationS + 0.05
  o1.start(now)
  o2.start(now)
  lfo.start(now)
  o1.stop(stopAt)
  o2.stop(stopAt)
  lfo.stop(stopAt)
}

function playFlight(flight: Flight): void {
  bannerText.textContent = flight.message

  // Apply the banner theme (colours).
  const theme = themeById(flight.theme)
  banner.style.setProperty('--stripe-a', theme.a)
  banner.style.setProperty('--stripe-b', theme.b)
  banner.style.setProperty('--banner-ink', theme.text)

  // Apply the typography.
  banner.style.setProperty('--banner-font', fontById(flight.font).stack)

  // Compose the flier: plane base + character head (the blade spins on top).
  planeImg.src = planeBaseUrl(flight.color)
  headImg.src = headUrl(flight.head)

  const durationS = Math.max(2, flight.durationMs / 1000)

  // Restart the CSS fly animation from scratch.
  flyer.classList.remove('flying')
  void flyer.offsetWidth // force reflow so the animation can re-trigger
  flyer.style.setProperty('--fly-duration', `${durationS}s`)
  flyer.classList.add('flying')

  if (flight.sound !== false) {
    try {
      const ctx = ensureAudio()
      const start = ctx.currentTime
      startEngine(ctx, durationS)
      // The chosen signature sound as the plane passes the middle of the screen.
      playSound(ctx, flight.soundPack ?? 'quack', start + durationS / 2)
    } catch {
      // Audio is a nice-to-have; never let it break the visual.
    }
  }
}

// When the crossing finishes, drop the 'flying' class so the rig snaps back to
// its off-screen-left rest position. Without this, `animation-fill-mode: forwards`
// holds it at the right edge where the banner's ripple filter leaves a sliver of
// its tail visible top-right until the next flight.
flyer.addEventListener('animationend', (e) => {
  if (e.animationName === 'fly') flyer.classList.remove('flying')
})

window.quakpit?.onFlight(playFlight)
