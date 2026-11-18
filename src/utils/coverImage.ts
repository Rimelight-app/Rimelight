import { FALLBACK_PALETTE, type RGB } from '@/store/palette.store'

/** Loads a cover with CORS so pixels can be read. */
export function loadCover(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

/**
 * Returns a tiny, pre-blurred copy of the cover as a data URL. Stretched to
 * window size by CSS it looks like a heavy blur, but costs almost nothing to
 * paint compared with a live `filter: blur()` on a full-window layer.
 */
export function blurredCoverUrl(img: HTMLImageElement, size = 48, blur = 3) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return img.src
  ctx.filter = `blur(${blur}px) saturate(160%)`
  // Draw slightly oversized so the blur has no dark edges.
  const pad = blur * 3
  ctx.drawImage(img, -pad, -pad, size + pad * 2, size + pad * 2)
  return canvas.toDataURL('image/png')
}

/** Picks up to four distinct, reasonably saturated colours from a cover. */
export function extractPalette(img: HTMLImageElement): RGB[] {
  const size = 32
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return FALLBACK_PALETTE
  ctx.drawImage(img, 0, 0, size, size)
  const { data } = ctx.getImageData(0, 0, size, size)

  const buckets = new Map<
    number,
    { n: number; r: number; g: number; b: number }
  >()
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
    const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 }
    bucket.n++
    bucket.r += r
    bucket.g += g
    bucket.b += b
    buckets.set(key, bucket)
  }

  const scored = [...buckets.values()]
    .map(({ n, r, g, b }) => {
      const c: RGB = [r / n, g / n, b / n]
      const max = Math.max(...c)
      const min = Math.min(...c)
      const sat = max === 0 ? 0 : (max - min) / max
      const light = max / 255
      const score = n * (0.35 + sat) * (light > 0.12 && light < 0.95 ? 1 : 0.3)
      return { c, score }
    })
    .sort((a, b) => b.score - a.score)

  const picked: RGB[] = []
  for (const { c } of scored) {
    const distinct = picked.every(
      (p) => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) > 60,
    )
    if (distinct) picked.push(c)
    if (picked.length === 4) break
  }
  while (picked.length < 4) picked.push(FALLBACK_PALETTE[picked.length])
  return picked
}

export const rgb = (c: RGB, a = 1) =>
  `rgb(${Math.round(c[0])} ${Math.round(c[1])} ${Math.round(c[2])} / ${a})`

/** Lifts very dark colours so bars stay visible on the dark backdrop. */
export function brighten(c: RGB, min = 150): RGB {
  const max = Math.max(...c)
  if (max >= min || max === 0) return c
  const k = min / max
  return [
    Math.min(255, c[0] * k),
    Math.min(255, c[1] * k),
    Math.min(255, c[2] * k),
  ]
}
