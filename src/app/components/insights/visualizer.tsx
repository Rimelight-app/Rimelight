import { useEffect, useRef } from 'react'
import { audioEngine } from '@/app/hooks/use-audio-context'
import { usePlayerIsPlaying } from '@/store/player.store'

const BARS = 72
const MIN_HZ = 32
const MAX_HZ = 16000
/** Gap between bars, as a share of a bar's slot. */
const GAP = 0.32
/** How fast bars fall (share of full height per second). */
const FALL = 1.6
/** Peak markers hold, then fall slower than the bars. */
const PEAK_HOLD_MS = 420
const PEAK_FALL = 0.55

/**
 * Spectrum of what is playing, read from the end of the audio graph (after
 * EQ, so it shows what you hear). Bars are spread on a log scale, the way the
 * ear hears pitch, with a quiet dot holding each bar's recent peak. Drawn on
 * a canvas only while the page is visible and something is playing.
 */
export function Visualizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isPlaying = usePlayerIsPlaying()
  const playingRef = useRef(isPlaying)
  playingRef.current = isPlaying
  const kick = useRef<() => void>(() => undefined)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    let analyser: AnalyserNode | null = null
    let source: AudioNode | null = null
    let bins: Uint8Array<ArrayBuffer> = new Uint8Array(0)
    const levels = new Float32Array(BARS)
    const peaks = new Float32Array(BARS)
    const peakAt = new Float64Array(BARS)
    let ranges: [number, number][] = []
    let frame = 0
    let last = performance.now()
    let width = 0
    let height = 0

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      width = rect.width
      height = rect.height
      canvas.width = Math.round(rect.width * dpr)
      canvas.height = Math.round(rect.height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      draw(performance.now())
    }

    // Connect to the graph's last node; reconnect if the graph was rebuilt.
    const attach = () => {
      const tap = audioEngine.tap
      const audioCtx = audioEngine.ctx
      if (!tap || !audioCtx || audioCtx.state === 'closed') return false
      if (source === tap && analyser) return true
      detach()
      analyser = audioCtx.createAnalyser()
      analyser.fftSize = 4096
      analyser.smoothingTimeConstant = 0.72
      tap.connect(analyser)
      source = tap
      bins = new Uint8Array(analyser.frequencyBinCount)
      const hzPerBin = audioCtx.sampleRate / analyser.fftSize
      ranges = Array.from({ length: BARS }, (_, i) => {
        const lo = MIN_HZ * (MAX_HZ / MIN_HZ) ** (i / BARS)
        const hi = MIN_HZ * (MAX_HZ / MIN_HZ) ** ((i + 1) / BARS)
        const a = Math.max(1, Math.floor(lo / hzPerBin))
        const b = Math.max(a + 1, Math.ceil(hi / hzPerBin))
        return [a, Math.min(b, bins.length)]
      })
      return true
    }

    function detach() {
      if (source && analyser) {
        try {
          source.disconnect(analyser)
        } catch {
          // Already gone with the old graph.
        }
      }
      analyser = null
      source = null
    }

    function draw(now: number) {
      if (!ctx) return
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const live = playingRef.current && attach()
      if (live && analyser) analyser.getByteFrequencyData(bins)

      let moving = false
      for (let i = 0; i < BARS; i++) {
        let target = 0
        if (live && ranges[i]) {
          const [a, b] = ranges[i]
          let max = 0
          for (let j = a; j < b; j++) if (bins[j] > max) max = bins[j]
          // Lift the quieter top end a little so the right side moves too.
          target = Math.min(1, (max / 255) ** 1.6 * (1 + (i / BARS) * 0.35))
        }
        const level =
          target > levels[i] ? target : Math.max(target, levels[i] - FALL * dt)
        levels[i] = level
        if (level >= peaks[i]) {
          peaks[i] = level
          peakAt[i] = now
        } else if (now - peakAt[i] > PEAK_HOLD_MS) {
          peaks[i] = Math.max(level, peaks[i] - PEAK_FALL * dt)
        }
        if (level > 0.001 || peaks[i] > 0.001) moving = true
      }

      ctx.clearRect(0, 0, width, height)
      const slot = width / BARS
      const bar = slot * (1 - GAP)
      const floor = height - 2
      const usable = height - 14
      const fill = ctx.createLinearGradient(0, height - usable, 0, floor)
      fill.addColorStop(0, 'rgba(255,255,255,0.92)')
      fill.addColorStop(1, 'rgba(255,255,255,0.28)')
      ctx.fillStyle = fill
      for (let i = 0; i < BARS; i++) {
        const h = Math.max(2, levels[i] * usable)
        const x = i * slot + (slot - bar) / 2
        roundedTop(ctx, x, floor - h, bar, h, Math.min(bar / 2, 3))
      }
      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      for (let i = 0; i < BARS; i++) {
        if (peaks[i] < 0.02) continue
        const x = i * slot + slot / 2
        const y = floor - peaks[i] * usable - 6
        ctx.beginPath()
        ctx.arc(x, y, Math.min(1.6, bar / 2), 0, Math.PI * 2)
        ctx.fill()
      }
      return moving || live
    }

    const loop = (now: number) => {
      // Keep drawing while playing or while the bars settle after a pause.
      if (draw(now)) frame = requestAnimationFrame(loop)
      else frame = 0
    }
    kick.current = () => {
      if (!frame) {
        last = performance.now()
        frame = requestAnimationFrame(loop)
      }
    }

    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    resize()
    kick.current()

    return () => {
      cancelAnimationFrame(frame)
      frame = 0
      ro.disconnect()
      detach()
    }
  }, [])

  // Start drawing again when playback resumes.
  useEffect(() => {
    if (isPlaying) kick.current()
  }, [isPlaying])

  return (
    <canvas
      ref={canvasRef}
      className="h-40 w-full"
      aria-hidden
      data-testid="visualizer"
    />
  )
}

function roundedTop(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, h)
  ctx.beginPath()
  ctx.moveTo(x, y + h)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.lineTo(x + w - radius, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius)
  ctx.lineTo(x + w, y + h)
  ctx.closePath()
  ctx.fill()
}
