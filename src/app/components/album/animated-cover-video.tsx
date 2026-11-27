import { useEffect, useRef, useState } from 'react'
import {
  acquireCoverPlayer,
  canShareCoverPlayers,
  releaseCoverPlayer,
} from '@/app/components/album/shared-cover-player'
import { useAnimatedAlbumArtwork } from '@/app/hooks/use-animated-album-artwork'
import { cn } from '@/lib/utils'
import { useAppAnimatedCovers } from '@/store/app.store'
import { isDesktop } from '@/utils/desktop'

type AnimatedCoverScreen = 'album' | 'fullscreen' | 'playerBar'

interface AnimatedCoverVideoProps {
  /**
   * Artist names to look the album up with, in order: albumArtworkArtists
   * or songArtworkArtists (src/api/artworkArtists.ts).
   */
  artists: string[]
  album?: string
  className?: string
  screen?: AnimatedCoverScreen
}

export function AnimatedCoverVideo({
  artists,
  album,
  className,
  screen = 'album',
}: AnimatedCoverVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [hasVideoError, setHasVideoError] = useState(false)
  const { enabled: globalEnabled, screens } = useAppAnimatedCovers()

  const isScreenEnabled = (() => {
    switch (screen) {
      case 'fullscreen':
        return screens.fullscreen
      case 'playerBar':
        return screens.playerBar
      case 'album':
      default:
        return screens.album
    }
  })()

  const effectiveEnabled = globalEnabled && isScreenEnabled
  const { data: streamUrl } = useAnimatedAlbumArtwork(
    artists,
    album,
    effectiveEnabled,
  )

  useEffect(() => {
    if (effectiveEnabled && streamUrl) {
      setHasVideoError(false)
    }
  }, [effectiveEnabled, streamUrl])

  useEffect(() => {
    if (!effectiveEnabled || !streamUrl || !videoRef.current || hasVideoError) {
      return
    }

    const video = videoRef.current

    // Desktop: show the stream's shared player (shared-cover-player.ts), so
    // every screen is on the same frame.
    if (canShareCoverPlayers()) {
      const player = acquireCoverPlayer(streamUrl)
      const sync = () => {
        if (player.status === 'failed') {
          setHasVideoError(true)
          return
        }
        if (player.stream && video.srcObject !== player.stream) {
          video.srcObject = player.stream
          video.play().catch(() => {})
        }
      }
      const resume = () => {
        if (document.visibilityState === 'visible' && video.paused) {
          video.play().catch(() => {})
        }
      }
      sync()
      const unsubscribe = player.subscribe(sync)
      document.addEventListener('visibilitychange', resume)

      return () => {
        document.removeEventListener('visibilitychange', resume)
        unsubscribe()
        video.pause()
        video.srcObject = null
        releaseCoverPlayer(player)
      }
    }

    // A browser without captureStream(): this screen plays its own copy.
    const canPlayNativeHls =
      video.canPlayType('application/vnd.apple.mpegurl') !== ''
    let hlsInstance: { destroy: () => void } | null = null
    let cancelled = false

    if (canPlayNativeHls && !isDesktop()) {
      video.src = streamUrl
      video.play().catch(() => {
        setHasVideoError(true)
      })

      return () => {
        video.pause()
        video.removeAttribute('src')
        video.load()
      }
    }

    const attachHls = async () => {
      const module = await import('hls.js')
      const Hls = module.default

      if (cancelled) {
        return
      }

      if (!videoRef.current || !Hls.isSupported()) {
        setHasVideoError(true)
        return
      }

      const hls = new Hls()
      hlsInstance = hls

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad()
            return
          }

          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError()
            return
          }

          setHasVideoError(true)
        }
      })

      hls.loadSource(streamUrl)
      hls.attachMedia(video)

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {
          if (cancelled) {
            return
          }

          setHasVideoError(true)
        })
      })
    }

    attachHls().catch(() => {
      if (!cancelled) {
        setHasVideoError(true)
      }
    })

    return () => {
      cancelled = true
      hlsInstance?.destroy()
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
  }, [streamUrl, hasVideoError, effectiveEnabled])

  if (!effectiveEnabled || !streamUrl || hasVideoError) {
    return null
  }

  return (
    <video
      ref={videoRef}
      className={cn(
        'absolute inset-0 w-full h-full object-cover pointer-events-none',
        className,
      )}
      muted
      loop
      autoPlay
      playsInline
      preload="metadata"
      aria-hidden="true"
      onError={() => setHasVideoError(true)}
    />
  )
}
