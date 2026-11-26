import { useEffect, useState } from 'react'
import { getSimpleCoverArtUrl } from '@/api/httpClient'
import { usePaletteStore } from '@/store/palette.store'
import { usePlayerCurrentSong } from '@/store/player.store'
import { useRimelightSettings } from '@/store/rimelight-settings.store'
import { blurredCoverUrl, extractPalette, loadCover } from '@/utils/coverImage'

type Layer = { url: string; id: number }

/**
 * Window-wide backdrop: the current cover, pre-blurred on a tiny canvas and
 * stretched, with a dark wash. Also publishes the cover palette.
 */
export function AppBackdrop() {
  const song = usePlayerCurrentSong()
  const coverArt = song?.coverArt
  const setPalette = usePaletteStore((s) => s.setPalette)
  const [layers, setLayers] = useState<Layer[]>([])
  const mode = useRimelightSettings((s) => s.backdrop)

  useEffect(() => {
    if (!coverArt) return
    let cancelled = false
    loadCover(getSimpleCoverArtUrl(coverArt, 'song', '150'))
      .then((img) => {
        if (cancelled) return
        const url = blurredCoverUrl(img)
        try {
          setPalette(extractPalette(img))
        } catch {
          /* keep previous palette */
        }
        setLayers((prev) => [...prev.slice(-1), { url, id: Date.now() }])
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [coverArt, setPalette])

  return (
    <div
      aria-hidden
      className="fixed inset-0 -z-10 overflow-hidden bg-[hsl(240_14%_5%)] pointer-events-none"
    >
      <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_20%_0%,rgb(70_70_90/0.35),transparent_60%),radial-gradient(90%_70%_at_100%_100%,rgb(40_40_60/0.4),transparent_60%)]" />

      {mode !== 'off' &&
        layers.map((layer) => (
          <div
            key={layer.id}
            className="absolute -inset-[6%] bg-cover bg-center animate-backdrop-in"
            style={{ backgroundImage: `url(${layer.url})` }}
          />
        ))}

      <div
        className={
          mode === 'vivid'
            ? 'absolute inset-0 bg-gradient-to-b from-black/15 via-black/25 to-black/50'
            : mode === 'dim'
              ? 'absolute inset-0 bg-gradient-to-b from-black/55 via-black/65 to-black/80'
              : 'absolute inset-0 bg-gradient-to-b from-black/35 via-black/45 to-black/65'
        }
      />
    </div>
  )
}
