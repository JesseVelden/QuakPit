// Generates placeholder menu-bar / tray icons (a tiny black duck silhouette)
// as proper PNG files, with no external dependencies. Replaced by real art later.
const zlib = require('node:zlib')
const fs = require('node:fs')
const path = require('node:path')

const outDir = path.join(__dirname, '..', 'build')
const windowsTraySource = path.join(__dirname, '..', 'site', 'thumb-head-duck.png')

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}

function encodePNG(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type RGBA
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
  }
  const idat = zlib.deflateSync(raw, { level: 9 })
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

function inEllipse(u, v, cx, cy, rx, ry) {
  const dx = (u - cx) / rx
  const dy = (v - cy) / ry
  return dx * dx + dy * dy <= 1
}

function drawDuck(size) {
  const buf = Buffer.alloc(size * size * 4) // transparent
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size
      const v = (y + 0.5) / size
      const inside =
        inEllipse(u, v, 0.45, 0.66, 0.34, 0.23) || // body
        inEllipse(u, v, 0.69, 0.4, 0.17, 0.17) || // head
        inEllipse(u, v, 0.87, 0.42, 0.07, 0.04) // beak
      if (inside) {
        const i = (y * size + x) * 4
        buf[i] = 0
        buf[i + 1] = 0
        buf[i + 2] = 0
        buf[i + 3] = 255
      }
    }
  }
  return buf
}

fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, 'iconTemplate.png'), encodePNG(18, drawDuck(18)))
fs.writeFileSync(path.join(outDir, 'iconTemplate@2x.png'), encodePNG(36, drawDuck(36)))
if (!fs.existsSync(windowsTraySource)) {
  throw new Error(`Missing ${windowsTraySource} — add the Windows tray icon source there.`)
}
fs.copyFileSync(windowsTraySource, path.join(outDir, 'tray-icon.png'))
console.log('Wrote build/iconTemplate.png and build/iconTemplate@2x.png')
console.log('Wrote build/tray-icon.png (from site/thumb-head-duck.png)')
