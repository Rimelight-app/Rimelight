import { MutableRefObject, RefObject, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'react-toastify'
import { MpvMediaElement } from '@/service/mpv-player'
import { handleSongError } from '@/service/playback-errors'
import {
  usePlayerActions,
  usePlayerIsPlaying,
  usePlayerStore,
} from '@/store/player.store'
import { ISong } from '@/types/responses/song'

type Handler = () => void

type MpvAudioProps = {
  audioRef: RefObject<HTMLAudioElement>
  src: string
  song?: ISong | null
  live?: boolean
  loop?: boolean
  playbackRate?: number
  getStart?: () => number
  onPlay?: Handler
  onPause?: Handler
  onLoadedMetadata?: Handler
  onTimeUpdate?: Handler
  onEnded?: Handler
  onLoadStart?: Handler
  'data-testid'?: string
}

/**
 * The mpv engine's stand-in for <audio>: same props the player passes to
 * AudioPlayer, played by mpv in the main process.
 */
export function MpvAudio({
  audioRef,
  src,
  song = null,
  live = false,
  loop = false,
  playbackRate = 1,
  getStart,
  onPlay,
  onPause,
  onLoadedMetadata,
  onTimeUpdate,
  onEnded,
  onLoadStart,
  'data-testid': testId,
}: MpvAudioProps) {
  const { t } = useTranslation()
  const isPlaying = usePlayerIsPlaying()
  const { setPlayingState } = usePlayerActions()
  const element = useMemo(() => new MpvMediaElement(), [])

  // Latest handlers without re-subscribing.
  const handlers = useRef({
    onPlay,
    onPause,
    onLoadedMetadata,
    onTimeUpdate,
    onEnded,
    onLoadStart,
  })
  handlers.current = {
    onPlay,
    onPause,
    onLoadedMetadata,
    onTimeUpdate,
    onEnded,
    onLoadStart,
  }

  useEffect(() => {
    ;(audioRef as MutableRefObject<unknown>).current = element
    positionSource = element
    const on = (name: string, fn: () => void) => {
      element.addEventListener(name, fn)
      return () => element.removeEventListener(name, fn)
    }
    const offs = [
      on('play', () => handlers.current.onPlay?.()),
      on('pause', () => handlers.current.onPause?.()),
      on('loadedmetadata', () => {
        handlers.current.onLoadedMetadata?.()
        updatePosition(element)
      }),
      on('timeupdate', () => handlers.current.onTimeUpdate?.()),
      on('seeked', () => updatePosition(element)),
      on('ended', () => handlers.current.onEnded?.()),
      on('loadstart', () => handlers.current.onLoadStart?.()),
      on('error', () => {
        // Songs: the shared error path (retry once, then skip). Radio and
        // podcasts: as before.
        const failed = element.song
        if (failed) {
          handleSongError(failed.id, () => {
            const wasPlaying = usePlayerStore.getState().playerState.isPlaying
            element.load()
            if (wasPlaying) element.play()
          })
          return
        }
        toast.error(t('warnings.songError'))
        setPlayingState(false)
      }),
    ]
    return () => {
      for (const off of offs) off()
      element.detach()
      if (positionSource === element) positionSource = null
      if ((audioRef as MutableRefObject<unknown>).current === element) {
        ;(audioRef as MutableRefObject<unknown>).current = null
      }
    }
  }, [audioRef, element, setPlayingState, t])

  element.song = song
  element.live = live
  if (getStart) element.getStart = getStart

  useEffect(() => {
    element.loop = loop
  }, [element, loop])

  useEffect(() => {
    element.playbackRate = playbackRate
  }, [element, playbackRate])

  // Before src: a new source starts playing or paused as the store says.
  useEffect(() => {
    if (isPlaying) element.play()
    else element.pause()
    updatePosition(element)
  }, [element, isPlaying])

  useEffect(() => {
    element.src = src
  }, [element, src])

  return <span hidden data-testid={testId} data-mpv-src={src} />
}

let positionSource: MpvMediaElement | null = null

/** The system media controls (MPRIS, Windows) show mpv's position. */
function updatePosition(element: MpvMediaElement | null = positionSource) {
  if (!element) return
  const ms = navigator.mediaSession
  if (!ms?.setPositionState) return
  const duration = element.duration
  try {
    if (!Number.isFinite(duration) || duration <= 0) {
      ms.setPositionState()
      return
    }
    ms.setPositionState({
      duration,
      position: Math.min(Math.max(0, element.currentTime), duration),
      playbackRate: element.paused ? 1 : element.playbackRate || 1,
    })
  } catch {
    // invalid state while switching songs
  }
}

/** 60 s of silence (4 kHz, 8-bit mono WAV, 240 kB). */
function silentWavUrl(): string {
  const rate = 4000
  const samples = rate * 60
  const buffer = new ArrayBuffer(44 + samples)
  const v = new DataView(buffer)
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i))
  }
  str(0, 'RIFF')
  v.setUint32(4, 36 + samples, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, rate, true)
  v.setUint32(28, rate, true)
  v.setUint16(32, 1, true)
  v.setUint16(34, 8, true)
  str(36, 'data')
  v.setUint32(40, samples, true)
  new Uint8Array(buffer, 44).fill(128)
  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }))
}

let silentUrl: string | null = null

/**
 * With the mpv engine Chromium plays nothing, so the system media controls
 * (MPRIS on Linux, the Windows media overlay) would not show Rimelight. A
 * silent loop keeps them active; Chromium's own audio output is switched off
 * in this mode, so it never touches a sound device.
 */
export function MediaSessionKeeper() {
  const ref = useRef<HTMLAudioElement>(null)
  const isPlaying = usePlayerIsPlaying()
  const hasMedia = usePlayerStore(
    (s) =>
      s.songlist.currentList.length > 0 ||
      s.songlist.radioList.length > 0 ||
      s.songlist.podcastList.length > 0,
  )
  if (!silentUrl) silentUrl = silentWavUrl()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (isPlaying && hasMedia) el.play().catch(() => {})
    else el.pause()
  }, [isPlaying, hasMedia])

  // When the silent loop starts over, Chromium takes its position from it;
  // give the real one back (and refresh it now and then).
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let last = 0
    let lastSent = 0
    const onTime = () => {
      const now = Date.now()
      if (el.currentTime < last || now - lastSent > 5000) {
        lastSent = now
        updatePosition()
      }
      last = el.currentTime
    }
    el.addEventListener('timeupdate', onTime)
    return () => el.removeEventListener('timeupdate', onTime)
  }, [])

  return (
    <audio
      ref={ref}
      src={silentUrl}
      loop
      preload="auto"
      data-testid="media-session-keeper"
      hidden
    />
  )
}
