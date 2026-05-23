// =============================================================================
// Quakpit landing page — static, no backend, no analytics.
// The only network call is the visitor's browser hitting the GitHub Releases
// API (below) to fill in the download links. Everything else runs locally.
// =============================================================================

// --- Configuration: point this at the GitHub repo that hosts the releases ---
const GITHUB_OWNER = 'Ooble-Studio'
const GITHUB_REPO = 'QuakPit'
// ---------------------------------------------------------------------------

const repoUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`
const releasesPage = `${repoUrl}/releases/latest`

const el = {
  mac: document.getElementById('dl-mac'),
  note: document.getElementById('dl-note'),
  gh: document.getElementById('gh-link'),
  osGh: document.getElementById('os-gh'),
  year: document.getElementById('year')
}

el.year.textContent = new Date().getFullYear()
el.gh.href = repoUrl
if (el.osGh) el.osGh.href = repoUrl

// macOS is the only platform for now (Windows build is coming soon).
// Default fallback: send people to the latest-release page.
el.mac.href = releasesPage

function pickAsset(assets, ...exts) {
  return assets.find((a) => exts.some((ext) => a.name.toLowerCase().endsWith(ext)))
}

async function loadLatestRelease() {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
      { headers: { Accept: 'application/vnd.github+json' } }
    )
    if (!res.ok) throw new Error(String(res.status))
    const data = await res.json()
    const assets = data.assets || []

    const mac = pickAsset(assets, '.dmg')
    if (mac) el.mac.href = mac.browser_download_url

    if (mac) {
      const v = (data.tag_name || data.name || '').replace(/^v/, '')
      el.note.textContent = v ? `Free • Latest version ${v}` : 'Free • macOS'
    } else {
      throw new Error('no installers in latest release')
    }
  } catch (err) {
    el.note.innerHTML = `No build published yet — see <a href="${releasesPage}">all releases</a>.`
  }
}

loadLatestRelease()

// =============================================================================
// Playground — compose a flight and launch it. Mirrors the app's themes/fliers.
// =============================================================================

// Banner colour themes (kept in sync with src/renderer/themes.ts).
const THEMES = [
  { id: 'classic', name: 'Classic', free: true, a: '#ffffff', b: '#ffe24d', text: '#1a1a1a' },
  { id: 'midnight', name: 'Midnight', free: false, a: '#10233a', b: '#37e0ff', text: '#ffffff' },
  { id: 'sunset', name: 'Sunset', free: false, a: '#ff8a3d', b: '#ffd24d', text: '#3a1500' },
  { id: 'mint', name: 'Mint', free: false, a: '#bff5e0', b: '#16c79a', text: '#06281f' },
  { id: 'bubblegum', name: 'Bubblegum', free: false, a: '#ff8ad1', b: '#9b6bff', text: '#2a0a3a' }
]

// Characters / heads (kept in sync with src/renderer/fliers.ts). Duck = free;
// each carries the sound that the app auto-plays for it (sounds.ts).
const CHARACTERS = [
  { id: 'duck', name: 'Duck', free: true, sound: 'quack' },
  { id: 'corgi', name: 'Corgi', free: false, sound: 'dog' },
  { id: 'dino', name: 'Dino', free: false, sound: 'dino' },
  { id: 'pigeon', name: 'Pigeon', free: false, sound: 'pigeon' },
  { id: 'capybara', name: 'Capybara', free: false, sound: 'capy' }
]

// Plane colours (kept in sync with src/renderer/fliers.ts). Red = free.
const COLORS = [
  { id: 'red', name: 'Red', free: true },
  { id: 'blue', name: 'Blue', free: false },
  { id: 'green', name: 'Green', free: false },
  { id: 'pink', name: 'Pink', free: false },
  { id: 'black', name: 'Black', free: false }
]

const pg = {
  flyer: document.getElementById('pg-flyer'),
  chars: document.getElementById('pg-chars'),
  colors: document.getElementById('pg-colors'),
  themes: document.getElementById('pg-themes'),
  message: document.getElementById('pg-message'),
  sound: document.getElementById('pg-sound'),
  launch: document.getElementById('pg-launch'),
  hear: document.getElementById('pg-hear'),
  hint: document.getElementById('pg-hint')
}

if (pg.flyer) {
  const banner = pg.flyer.querySelector('.banner')
  const bannerText = pg.flyer.querySelector('.banner span')
  const planeImg = pg.flyer.querySelector('.aircraft .plane')
  const headImg = pg.flyer.querySelector('.aircraft .head')
  const propImg = pg.flyer.querySelector('.aircraft .prop')
  const customImg = pg.flyer.querySelector('.aircraft .custom')

  // The flier is composed like the app: plane colour + character head + blade.
  // `custom` (a data URL) replaces the whole plane (the app's Pro custom image).
  const state = { char: CHARACTERS[0], color: COLORS[0], theme: THEMES[0], custom: '' }

  // Build a row of selectable chips; returns a refresh() syncing only its chips.
  function buildChips(container, items, render, onPick, isActive) {
    container.innerHTML = ''
    const chips = items.map((item) => {
      const chip = document.createElement('button')
      chip.type = 'button'
      chip.className = 'chip'
      chip.setAttribute('aria-pressed', String(isActive(item)))
      chip.innerHTML = render(item)
      chip.addEventListener('click', () => {
        onPick(item)
        refresh()
      })
      container.appendChild(chip)
      return chip
    })
    function refresh() {
      chips.forEach((c, i) => c.setAttribute('aria-pressed', String(isActive(items[i]))))
    }
    return refresh
  }

  const proTag = (free) => (free ? '' : '<span class="pro">PRO</span>')
  let uploadChip = null

  // Character picker (real heads, shown with the app's own thumbnails).
  function selectChar(c) {
    state.char = c
    state.custom = '' // choosing a character cancels a custom plane
    refreshChars()
    if (uploadChip) uploadChip.setAttribute('aria-pressed', 'false')
  }
  const refreshChars = buildChips(
    pg.chars,
    CHARACTERS,
    (c) => `<img class="chip-ic" src="./thumb-head-${c.id}.png" alt="" />${c.name}${proTag(c.free)}`,
    selectChar,
    (c) => state.custom === '' && c.id === state.char.id
  )

  // Plane-colour picker (real colours, with the app's thumbnails).
  buildChips(
    pg.colors,
    COLORS,
    (c) => `<img class="chip-ic" src="./thumb-plane-${c.id}.png" alt="" />${c.name}${proTag(c.free)}`,
    (c) => (state.color = c),
    (c) => c.id === state.color.id
  )

  // Banner-theme picker.
  buildChips(
    pg.themes,
    THEMES,
    (t) =>
      `<span class="swatch" style="background:repeating-linear-gradient(-12deg,${t.a} 0 6px,${t.b} 6px 12px)"></span>${t.name}${proTag(t.free)}`,
    (t) => (state.theme = t),
    (t) => t.id === state.theme.id
  )

  // "Fly your own plane image" — a real Pro feature (custom plane import).
  // Reads the file locally (FileReader); nothing is uploaded anywhere.
  uploadChip = document.createElement('label')
  uploadChip.className = 'chip upload-chip'
  uploadChip.setAttribute('aria-pressed', 'false')
  uploadChip.title = 'Fly your own image (Pro in the app)'
  uploadChip.innerHTML =
    '<svg class="up-ic" viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="#2b4cff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M5 20h14"/></g></svg>' +
    '<img class="up-thumb" alt="" /><span class="up-label">Your plane</span><span class="pro">PRO</span>' +
    '<input type="file" accept="image/*" hidden />'
  pg.chars.appendChild(uploadChip)
  const uploadInput = uploadChip.querySelector('input')
  const uploadThumb = uploadChip.querySelector('.up-thumb')
  const uploadIcon = uploadChip.querySelector('.up-ic')
  uploadInput.addEventListener('change', () => {
    const file = uploadInput.files && uploadInput.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      state.custom = String(reader.result)
      uploadThumb.src = state.custom
      uploadThumb.style.display = 'block'
      uploadIcon.style.display = 'none'
      refreshChars() // clears the character highlight while custom is active
      uploadChip.setAttribute('aria-pressed', 'true')
      launch() // preview right away
    }
    reader.readAsDataURL(file)
  })

  function applyFlight() {
    bannerText.textContent = pg.message.value || 'Your meeting in 5 minutes'

    banner.style.setProperty('--stripe-a', state.theme.a)
    banner.style.setProperty('--stripe-b', state.theme.b)
    banner.style.setProperty('--banner-ink', state.theme.text)

    const custom = state.custom !== ''
    planeImg.style.display = custom ? 'none' : 'block'
    headImg.style.display = custom ? 'none' : 'block'
    propImg.style.display = custom ? 'none' : 'block'
    customImg.style.display = custom ? 'block' : 'none'
    if (custom) {
      customImg.src = state.custom
    } else {
      planeImg.src = `./plane-${state.color.id}-base.png`
      headImg.src = `./head-${state.char.id}.png`
    }
  }

  function launch() {
    applyFlight()
    if (pg.hint) pg.hint.style.opacity = '0'

    const durationS = 6
    // Restart the CSS fly animation from scratch.
    pg.flyer.classList.remove('flying')
    void pg.flyer.offsetWidth // force reflow so the animation re-triggers
    pg.flyer.style.setProperty('--fly-duration', `${durationS}s`)
    pg.flyer.classList.add('flying')

    if (pg.sound.checked) playFlightSound(durationS, state.char.sound)
  }

  pg.launch.addEventListener('click', launch)
  pg.hear.addEventListener('click', () => playFlightSound(3.4, state.char.sound))
  pg.message.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') launch()
  })
}

// =============================================================================
// Audio — engine drone + real quack, ported from src/renderer/overlay/overlay.ts
// =============================================================================

let audioCtx = null

// One signature sound per character (mirrors src/renderer/sounds.ts).
const SOUND_URL = {
  quack: './quack.wav',
  dog: './dog.wav',
  dino: './dino.wav',
  pigeon: './pigeon.wav',
  capy: './capy.wav'
}
const soundBuffers = {}
const soundLoading = {}

function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  if (audioCtx.state === 'suspended') void audioCtx.resume()
  void loadSound(audioCtx, 'quack')
  return audioCtx
}

function loadSound(ctx, id) {
  if (soundBuffers[id]) return Promise.resolve()
  const url = SOUND_URL[id]
  if (!url) return Promise.resolve()
  if (!soundLoading[id]) {
    soundLoading[id] = fetch(url)
      .then((r) => r.arrayBuffer())
      .then((buf) => ctx.decodeAudioData(buf))
      .then((decoded) => {
        soundBuffers[id] = decoded
      })
      .catch(() => {
        delete soundLoading[id]
      })
  }
  return soundLoading[id]
}

function playSoundSample(ctx, id, when, volume = 0.9) {
  void loadSound(ctx, id).then(() => {
    const buffer = soundBuffers[id]
    if (!buffer) return
    const src = ctx.createBufferSource()
    src.buffer = buffer
    const gain = ctx.createGain()
    gain.gain.value = volume
    src.connect(gain).connect(ctx.destination)
    src.start(Math.max(when, ctx.currentTime))
  })
}

// A propeller-engine drone that fades in/out and pans left -> right.
function startEngine(ctx, durationS) {
  const now = ctx.currentTime

  const master = ctx.createGain()
  master.gain.setValueAtTime(0.0001, now)
  master.gain.exponentialRampToValueAtTime(0.16, now + 0.8)
  master.gain.setValueAtTime(0.16, Math.max(now + 0.8, now + durationS - 0.8))
  master.gain.exponentialRampToValueAtTime(0.0001, now + durationS)

  const panner = ctx.createStereoPanner()
  panner.pan.setValueAtTime(-0.9, now)
  panner.pan.linearRampToValueAtTime(0.9, now + durationS)
  master.connect(panner).connect(ctx.destination)

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

function playFlightSound(durationS, soundId) {
  try {
    const ctx = ensureAudio()
    const start = ctx.currentTime
    startEngine(ctx, durationS)
    playSoundSample(ctx, soundId || 'quack', start + durationS / 2)
  } catch {
    // Audio is a nice-to-have; never let it break the visual.
  }
}

// =============================================================================
// Hero sky — a few planes cross it at staggered times, each with its own skin
// (coloured plane + character head), banner message and banner colours. Silent
// by design. The prop spins like the app (plane + head + spinning blade).
// =============================================================================
;(function heroPlanes() {
  const sky = document.querySelector('.hero .sky')
  if (!sky) return

  const themeOf = (id) => THEMES.find((t) => t.id === id) || THEMES[0]

  // Different durations + phase offsets keep 2–3 planes on screen without them
  // ever entering at the same moment. Altitudes avoid the centred copy.
  const planes = [
    { color: 'red', head: 'duck', theme: 'classic', msg: 'Stand-up in 5 minutes', top: '5%', dur: 15, delay: -2 },
    { color: 'blue', head: 'corgi', theme: 'midnight', msg: 'Call with Jack in 10 min', top: '38%', dur: 18, delay: -9 },
    { color: 'green', head: 'dino', theme: 'sunset', msg: 'Design review at 3 pm', top: '62%', dur: 21, delay: -15 }
  ]

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const list = reduce ? planes.slice(0, 2) : planes

  list.forEach((p, i) => {
    const t = themeOf(p.theme)
    const fly = document.createElement('div')
    fly.className = 'flyer hero-plane' + (reduce ? ' parked' : '')
    fly.setAttribute('aria-hidden', 'true')
    fly.style.top = p.top
    if (reduce) {
      fly.style.transform = 'translateX(' + (12 + i * 46) + 'vw)'
    } else {
      // Literal inline animation (no CSS var) — most robust across browsers.
      fly.style.animation = 'fly ' + p.dur + 's linear ' + p.delay + 's infinite'
    }
    fly.innerHTML =
      '<div class="banner" style="--stripe-a:' + t.a + ';--stripe-b:' + t.b + ';--banner-ink:' + t.text + '">' +
      '<span>' + p.msg + '</span></div>' +
      '<div class="rope"></div>' +
      '<div class="aircraft">' +
      '<img class="plane" src="./plane-' + p.color + '-base.png" alt="" />' +
      '<img class="head" src="./head-' + p.head + '.png" alt="" />' +
      '<img class="prop" src="./blade.png" alt="" />' +
      '</div>'
    sky.appendChild(fly)
  })
})()

// =============================================================================
// Scroll reveal — elements fade/slide in as they enter the viewport.
// =============================================================================
;(function scrollReveal() {
  const items = document.querySelectorAll('.reveal')
  if (!('IntersectionObserver' in window)) {
    items.forEach((n) => n.classList.add('in'))
    return
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('in')
          io.unobserve(e.target)
        }
      })
    },
    { rootMargin: '0px 0px -10% 0px', threshold: 0.08 }
  )
  items.forEach((n) => io.observe(n))
})()
