// Compares the PNGs two screenshot runs have in common (same file names),
// e.g. views-pixels.mjs or fs-pixels.mjs on two builds.
// Usage: node perf/pixel-diff.mjs <dir A> <dir B> [diff out dir] [glob suffix]
//   Prints, per file: differing pixels, the largest channel difference and the
//   box around them. With an out dir, writes an image per differing file:
//   B dimmed, differing pixels in magenta.
import fs from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'

const [dirA, dirB, outDir, suffix = '.png'] = process.argv.slice(2)
if (!dirA || !dirB)
  throw new Error('usage: pixel-diff.mjs <dir A> <dir B> [out dir]')
if (outDir) fs.mkdirSync(outDir, { recursive: true })

const names = fs
  .readdirSync(dirA)
  .filter((f) => f.endsWith(suffix) && fs.existsSync(path.join(dirB, f)))
  .sort()
const rows = []
for (const name of names) {
  const A = PNG.sync.read(fs.readFileSync(path.join(dirA, name)))
  const B = PNG.sync.read(fs.readFileSync(path.join(dirB, name)))
  if (A.width !== B.width || A.height !== B.height) {
    rows.push({
      name,
      size: `${A.width}x${A.height} vs ${B.width}x${B.height}`,
    })
    continue
  }
  let n = 0
  let max = 0
  const box = [Infinity, Infinity, -1, -1]
  const out = outDir ? new PNG({ width: A.width, height: A.height }) : null
  for (let i = 0; i < A.data.length; i += 4) {
    const d = Math.max(
      Math.abs(A.data[i] - B.data[i]),
      Math.abs(A.data[i + 1] - B.data[i + 1]),
      Math.abs(A.data[i + 2] - B.data[i + 2]),
    )
    if (out) {
      out.data[i] = d ? 255 : B.data[i] >> 2
      out.data[i + 1] = d ? 0 : B.data[i + 1] >> 2
      out.data[i + 2] = d ? 255 : B.data[i + 2] >> 2
      out.data[i + 3] = 255
    }
    if (d > 0) {
      n++
      max = Math.max(max, d)
      const p = i / 4
      const x = p % A.width
      const y = Math.floor(p / A.width)
      box[0] = Math.min(box[0], x)
      box[1] = Math.min(box[1], y)
      box[2] = Math.max(box[2], x)
      box[3] = Math.max(box[3], y)
    }
  }
  if (out && n) fs.writeFileSync(path.join(outDir, name), PNG.sync.write(out))
  rows.push({ name, pixels: n, maxDelta: max, box: n ? box : null })
}
for (const r of rows) console.log(JSON.stringify(r))
console.log(
  JSON.stringify({
    files: rows.length,
    identical: rows.filter((r) => r.pixels === 0).length,
    worstPixels: Math.max(0, ...rows.map((r) => r.pixels ?? 0)),
  }),
)
