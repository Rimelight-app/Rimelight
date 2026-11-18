import { useEffect, useState } from 'react'
import { getSimpleCoverArtUrl } from '@/api/httpClient'
import { usePlayerCurrentSong } from '@/store/player.store'

type RGB = [number, number, number]

const FALLBACK: RGB[] = [
  [86, 70, 140],
  [40, 60, 120],
  [130, 60, 110],
  [30, 30, 50],
]

/** Picks up to four distinct, reasonably saturated colours from an image. */
function extractPalette(img: HTMLImageElement): RGB[] {
  const size = 32
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return FALLBACK
  ctx.drawImage(img, 0, 0, size, size)
  const { data } = ctx.getImageData(0, 0, size, size)

  // Bucket pixels into a coarse 4-bit-per-channel grid and count.
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
      // Prefer common colours, boost saturated mid-tones.
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
  while (picked.length < 4) picked.push(FALLBACK[picked.length])
  return picked
}

const rgb = (c: RGB, a = 1) =>
  `rgb(${Math.round(c[0])} ${Math.round(c[1])} ${Math.round(c[2])} / ${a})`

/**
 * Slowly drifting colour fields built from the current cover, under a
 * blurred copy of the cover itself. Motion stops with prefers-reduced-motion
 * or the "reduce effects" setting (handled in CSS).
 */
export function GradientBackdrop() {
  const song = usePlayerCurrentSong()
  const coverArt = song?.coverArt
  const [palette, setPalette] = useState<RGB[]>(FALLBACK)
  const [cover, setCover] = useState<string | null>(null)

  useEffect(() => {
    if (!coverArt) return
    const url = getSimpleCoverArtUrl(coverArt, 'song', '300')
    let cancelled = false
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      if (cancelled) return
      try {
        setPalette(extractPalette(img))
      } catch {
        setPalette(FALLBACK)
      }
      setCover(url)
    }
    img.src = url
    return () => {
      cancelled = true
    }
  }, [coverArt])

  const [a, b, c, d] = palette

  return (
    <div
      aria-hidden
      className="absolute inset-0 z-0 overflow-hidden bg-[hsl(240_14%_5%)]"
      style={{ backgroundColor: rgb(d, 1) }}
    >
      {cover && (
        <div
          className="absolute -inset-[15%] bg-cover bg-center opacity-60 transition-[background-image] duration-1000"
          style={{
            backgroundImage: `url(${cover})`,
            filter: 'blur(110px) saturate(1.6)',
          }}
        />
      )}
      <div
        className="cp-blob cp-blob-1"
        style={{
          background: `radial-gradient(circle, ${rgb(a, 0.85)} 0%, transparent 65%)`,
        }}
      />
      <div
        className="cp-blob cp-blob-2"
        style={{
          background: `radial-gradient(circle, ${rgb(b, 0.75)} 0%, transparent 65%)`,
        }}
      />
      <div
        className="cp-blob cp-blob-3"
        style={{
          background: `radial-gradient(circle, ${rgb(c, 0.7)} 0%, transparent 65%)`,
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/35 to-black/55" />
    </div>
  )
}
