import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { visualizerBus } from '@/lib/visualizer-bus'
import { usePaletteStore } from '@/store/palette.store'
import { usePlayerIsPlaying } from '@/store/player.store'
import { brighten, rgb } from '@/utils/coverImage'

interface VisualizerProps {
  className?: string
  bars?: number
}

/**
 * Mirrored, rounded frequency bars coloured with the cover palette.
 * Bands are log-spaced (bass gets fewer FFT bins per bar than treble), heights
 * ease towards their target and decay slowly so the motion stays calm.
 */
export function Visualizer({ className, bars = 64 }: VisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const palette = usePaletteStore((s) => s.palette)
  const isPlaying = usePlayerIsPlaying()
  const paletteRef = useRef(palette)
  paletteRef.current = palette

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    let running = true
    const levels = new Float32Array(bars)
    let freq: Uint8Array | null = null

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(canvas.clientWidth * dpr)
      canvas.height = Math.round(canvas.clientHeight * dpr)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    // Precompute log-spaced bin edges between ~40 Hz and ~16 kHz.
    let edges: number[] = []
    const computeEdges = (binCount: number, sampleRate: number) => {
      const nyquist = sampleRate / 2
      const lo = 40
      const hi = Math.min(16000, nyquist)
      edges = Array.from({ length: bars + 1 }, (_, i) => {
        const f = lo * (hi / lo) ** (i / bars)
        return Math.min(
          binCount - 1,
          Math.max(1, Math.round((f / nyquist) * binCount)),
        )
      })
    }

    const draw = () => {
      if (!running) return
      raf = requestAnimationFrame(draw)
      if (document.hidden) return

      const analyser = visualizerBus.get()
      const w = canvas.width
      const h = canvas.height
      ctx.clearRect(0, 0, w, h)

      if (analyser) {
        if (!freq || freq.length !== analyser.frequencyBinCount) {
          freq = new Uint8Array(analyser.frequencyBinCount)
          computeEdges(analyser.frequencyBinCount, analyser.context.sampleRate)
        }
        analyser.getByteFrequencyData(freq)
      }

      for (let i = 0; i < bars; i++) {
        let target = 0
        if (freq && isPlaying) {
          const start = edges[i]
          const end = Math.max(start + 1, edges[i + 1])
          let sum = 0
          for (let k = start; k < end; k++) sum += freq[k]
          target = sum / (end - start) / 255
          // gentle tilt so treble is not drowned out by bass
          target = Math.min(1, target * (0.85 + (i / bars) * 0.6)) ** 1.4
        }
        const cur = levels[i]
        levels[i] =
          target > cur
            ? cur + (target - cur) * 0.45
            : cur + (target - cur) * 0.12
      }

      const [c1, c2, c3] = paletteRef.current.map((c) => brighten(c, 170))
      const grad = ctx.createLinearGradient(0, 0, w, 0)
      grad.addColorStop(0, rgb(c1, 0.95))
      grad.addColorStop(0.5, rgb(c2, 0.95))
      grad.addColorStop(1, rgb(c3, 0.95))
      ctx.fillStyle = grad
      ctx.shadowColor = rgb(c2, 0.55)
      ctx.shadowBlur = 18

      const gap = w / bars
      const barW = Math.max(2, gap * 0.42)
      const mid = h / 2
      const radius = barW / 2
      for (let i = 0; i < bars; i++) {
        const half = Math.max(radius, levels[i] * (h * 0.48))
        const x = i * gap + (gap - barW) / 2
        ctx.beginPath()
        ctx.roundRect(x, mid - half, barW, half * 2, radius)
        ctx.fill()
      }
    }
    raf = requestAnimationFrame(draw)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [bars, isPlaying])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={cn('pointer-events-none block h-full w-full', className)}
    />
  )
}
