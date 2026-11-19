import { useEffect, useRef } from 'react'
import { getSimpleCoverArtUrl } from '@/api/httpClient'
import { useEffectsStore } from '@/store/effects.store'
import { type RGB, usePaletteStore } from '@/store/palette.store'
import { usePlayerCurrentSong } from '@/store/player.store'
import { blurredCoverCanvas, loadCover, rgb } from '@/utils/coverImage'

/** Width of the canvas the backdrop is drawn into; CSS stretches it. */
const CANVAS_WIDTH = 192
/** Redraws per second. The motion is very slow, so this is plenty. */
const FPS = 30
/** Cross-fade between two covers, in ms. */
const FADE_MS = 1200

type Layer = { cover: HTMLCanvasElement; since: number }

/**
 * Slowly turning, pre-blurred copies of the cover with drifting colour
 * fields from its palette (the same look as before).
 *
 * It is drawn into a small canvas that CSS stretches to the window: the
 * picture is all blur anyway, so nothing is lost, and the GPU only scales one
 * small texture per frame. The earlier version rotated five window-sized
 * layers every frame, which kept the GPU busy for as long as the player was
 * open. Still with "Reduce visual effects" or the system "reduce motion".
 */
export function GradientBackdrop() {
  const song = usePlayerCurrentSong()
  const coverArt = song?.coverArt
  const palette = usePaletteStore((s) => s.palette)
  const reduceEffects = useEffectsStore((s) => s.reduceEffects)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const layers = useRef<Layer[]>([])
  const paletteRef = useRef(palette)
  paletteRef.current = palette
  const redraw = useRef<() => void>(() => undefined)

  // Load each new cover into a small pre-blurred canvas and fade it in.
  useEffect(() => {
    if (!coverArt) return
    let cancelled = false
    loadCover(getSimpleCoverArtUrl(coverArt, 'song', '150'))
      .then((img) => {
        if (cancelled) return
        const cover = blurredCoverCanvas(img, 40, 3)
        if (!cover) return
        // Keep the previous cover underneath until the new one is opaque.
        layers.current = [
          ...layers.current.slice(-1),
          { cover, since: performance.now() },
        ]
        redraw.current()
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [coverArt])

  // Repaint at once with new colours (relevant when the motion is off).
  // biome-ignore lint/correctness/useExhaustiveDependencies: palette is read through a ref
  useEffect(() => {
    redraw.current()
  }, [palette])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d', { alpha: false })
    if (!canvas || !ctx) return

    const still =
      reduceEffects ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const start = performance.now()

    const resize = () => {
      const { width, height } = canvas.getBoundingClientRect()
      if (!width || !height) return
      canvas.width = CANVAS_WIDTH
      canvas.height = Math.max(1, Math.round((CANVAS_WIDTH * height) / width))
    }
    resize()
    const ro = new ResizeObserver(() => {
      resize()
      draw(performance.now())
    })
    ro.observe(canvas)

    function draw(now: number) {
      if (!canvas || !ctx) return
      const t = still ? 0 : (now - start) / 1000
      paint(
        ctx,
        canvas.width,
        canvas.height,
        t,
        now,
        layers.current,
        paletteRef.current,
      )
      // Drop covers that are fully hidden under a newer one.
      const list = layers.current
      if (list.length > 1 && now - list[list.length - 1].since > FADE_MS) {
        layers.current = list.slice(-1)
      }
    }
    redraw.current = () => draw(performance.now())

    let frame = 0
    let last = 0
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop)
      if (now - last < 1000 / FPS - 2) return
      last = now
      draw(now)
    }
    if (still) {
      draw(performance.now())
      // Still mode only redraws for a cover fade.
      const fade = window.setInterval(() => {
        const top = layers.current[layers.current.length - 1]
        if (top && performance.now() - top.since < FADE_MS + 100) {
          draw(performance.now())
        }
      }, 1000 / FPS)
      return () => {
        window.clearInterval(fade)
        ro.disconnect()
      }
    }
    frame = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
    }
  }, [reduceEffects])

  return (
    <div
      aria-hidden
      className="absolute inset-0 z-0 overflow-hidden"
      style={{ backgroundColor: rgb(palette[3], 1) }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        data-testid="fullscreen-backdrop"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/35 to-black/60" />
    </div>
  )
}

/** Linear 0 → 1 → 0 over `period` seconds. */
function triangle(t: number, period: number) {
  const x = (t / period) % 1
  return x < 0.5 ? x * 2 : 2 - x * 2
}

/** Ease-in-out 0 → 1 → 0, like a CSS `alternate` animation. */
function swing(t: number, period: number) {
  const x = (t / period) % 2
  const p = x < 1 ? x : 2 - x
  return (1 - Math.cos(Math.PI * p)) / 2
}

function paint(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  now: number,
  layers: Layer[],
  palette: RGB[],
) {
  const [a, b, c, d] = palette
  const vmax = Math.max(w, h) / 100

  ctx.globalAlpha = 1
  ctx.fillStyle = rgb(d, 1)
  ctx.fillRect(0, 0, w, h)

  // Two oversized copies of the cover turning in opposite directions.
  for (const layer of layers) {
    const fade = Math.min(1, (now - layer.since) / FADE_MS)
    const eased = 1 - (1 - fade) ** 3
    disc(
      ctx,
      layer.cover,
      w,
      h,
      150 * vmax,
      (t / 140) * Math.PI * 2,
      1.05 + 0.15 * triangle(t, 140),
      0.75 * eased,
    )
    disc(
      ctx,
      layer.cover,
      w,
      h,
      150 * vmax,
      -(t / 190) * Math.PI * 2,
      1.3 - 0.15 * triangle(t, 190),
      0.35 * eased,
    )
  }

  // Drifting colour fields.
  ctx.globalAlpha = 0.9
  const s1 = swing(t, 26)
  blob(
    ctx,
    (20 + 18 * s1) * vmax,
    (10 + 12 * s1) * vmax,
    35 * vmax * (1 + 0.15 * s1),
    rgb(a, 0.8),
  )
  const s2 = swing(t, 32)
  blob(
    ctx,
    w - (15 + 22 * s2) * vmax,
    h - (5 + 10 * s2) * vmax,
    35 * vmax * (1 - 0.1 * s2),
    rgb(b, 0.7),
  )
  const s3 = swing(t, 22)
  blob(
    ctx,
    (57.5 - 14 * s3) * vmax,
    (37.5 + 16 * s3) * vmax,
    27.5 * vmax * (1 + 0.2 * s3),
    rgb(c, 0.65),
  )
  ctx.globalAlpha = 1
}

function disc(
  ctx: CanvasRenderingContext2D,
  cover: HTMLCanvasElement,
  w: number,
  h: number,
  size: number,
  angle: number,
  scale: number,
  alpha: number,
) {
  if (alpha <= 0) return
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(w / 2, h / 2)
  ctx.rotate(angle)
  ctx.scale(scale, scale)
  ctx.beginPath()
  ctx.arc(0, 0, size / 2, 0, Math.PI * 2)
  ctx.clip()
  ctx.drawImage(cover, -size / 2, -size / 2, size, size)
  ctx.restore()
}

function blob(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius)
  g.addColorStop(0, color)
  g.addColorStop(0.62, color.replace(/[\d.]+\)$/, '0)'))
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2)
}
