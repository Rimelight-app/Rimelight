import { useEffect, useState } from 'react'
import { getSimpleCoverArtUrl } from '@/api/httpClient'
import { usePaletteStore } from '@/store/palette.store'
import { usePlayerCurrentSong } from '@/store/player.store'
import { blurredCoverUrl, loadCover, rgb } from '@/utils/coverImage'

/**
 * Slowly drifting colour fields built from the current cover (palette comes
 * from the app backdrop), over a pre-blurred copy of the cover. Motion stops
 * with prefers-reduced-motion or "Reduce visual effects".
 */
export function GradientBackdrop() {
  const song = usePlayerCurrentSong()
  const coverArt = song?.coverArt
  const [a, b, c, d] = usePaletteStore((s) => s.palette)
  const [cover, setCover] = useState<string | null>(null)

  useEffect(() => {
    if (!coverArt) return
    let cancelled = false
    loadCover(getSimpleCoverArtUrl(coverArt, 'song', '150'))
      .then((img) => {
        if (!cancelled) setCover(blurredCoverUrl(img, 40, 3))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [coverArt])

  return (
    <div
      aria-hidden
      className="absolute inset-0 z-0 overflow-hidden"
      style={{ backgroundColor: rgb(d, 1) }}
    >
      {cover && (
        <div key={cover.length} className="absolute inset-0 animate-backdrop-in">
          {/* Two oversized copies of the pre-blurred cover turning very slowly
              in opposite directions: a soft, living blur. */}
          <div
            className="cp-swirl cp-swirl-a"
            style={{ backgroundImage: `url(${cover})` }}
          />
          <div
            className="cp-swirl cp-swirl-b"
            style={{ backgroundImage: `url(${cover})` }}
          />
        </div>
      )}
      <div
        className="cp-blob cp-blob-1"
        style={{
          background: `radial-gradient(circle, ${rgb(a, 0.8)} 0%, transparent 62%)`,
        }}
      />
      <div
        className="cp-blob cp-blob-2"
        style={{
          background: `radial-gradient(circle, ${rgb(b, 0.7)} 0%, transparent 62%)`,
        }}
      />
      <div
        className="cp-blob cp-blob-3"
        style={{
          background: `radial-gradient(circle, ${rgb(c, 0.65)} 0%, transparent 62%)`,
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/35 to-black/60" />
    </div>
  )
}
