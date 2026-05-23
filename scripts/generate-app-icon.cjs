// App icon: ship the real Quakpit artwork. build/icon-master.png (1024x1024) is
// the source of truth; we copy it to build/icon.png, which electron-builder turns
// into .icns / .ico automatically. To update the icon, just replace icon-master.png.
const fs = require('node:fs')
const path = require('node:path')

const buildDir = path.join(__dirname, '..', 'build')
const master = path.join(buildDir, 'icon-master.png')
const out = path.join(buildDir, 'icon.png')

if (!fs.existsSync(master)) {
  throw new Error(`Missing ${master} — add the 1024x1024 app icon there.`)
}
fs.mkdirSync(buildDir, { recursive: true })
fs.copyFileSync(master, out)
console.log('Wrote build/icon.png (from icon-master.png)')
