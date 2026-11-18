import { useEffect, useState } from 'react'
import { getSimpleCoverArtUrl } from '@/api/httpClient'
import { usePlayerCurrentSong } from '@/store/player.store'

type Layer = { url: string; id: number }

/**
 * Window-wide backdrop: the current cover, scaled up and heavily blurred,
 * with a dark wash so white text stays readable. Covers crossfade on change.
 */
export function AppBackdrop() {
  const song = usePlayerCurrentSong()
  const coverArt = song?.coverArt
  const [layers, setLayers] = useState<Layer[]>([])

  useEffect(() => {
    if (!coverArt) return
    const url = getSimpleCoverArtUrl(coverArt, 'song', '300')
    let cancelled = false
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      if (cancelled) return
      setLayers((prev) => {
        if (prev.at(-1)?.url === url) return prev
        return [...prev.slice(-1), { url, id: Date.now() }]
      })
    }
    img.src = url
    return () => {
      cancelled = true
    }
  }, [coverArt])

  return (
    <div
      aria-hidden
      className="fixed inset-0 -z-10 overflow-hidden bg-[hsl(240_14%_5%)] pointer-events-none"
    >
      {/* Fallback when nothing has played yet */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_20%_0%,rgb(70_70_90/0.35),transparent_60%),radial-gradient(90%_70%_at_100%_100%,rgb(40_40_60/0.4),transparent_60%)]" />

      {layers.map((layer) => (
        <div
          key={layer.id}
          className="absolute -inset-[12%] bg-cover bg-center animate-backdrop-in"
          style={{
            backgroundImage: `url(${layer.url})`,
            filter: 'blur(90px) saturate(1.5)',
            transform: 'scale(1.15) translateZ(0)',
          }}
        />
      ))}

      {/* Wash: darker at the bottom where the player bar sits */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/45 to-black/65" />
    </div>
  )
}
