import {
  ComponentPropsWithoutRef,
  RefObject,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'react-toastify'
import { useAudioContext } from '@/app/hooks/use-audio-context'
import { useAudioFx } from '@/store/audio-fx.store'
import { serverAnswers } from '@/service/connection'
import { handleSongError as handlePlaybackError } from '@/service/playback-errors'
import {
  usePlayerActions,
  usePlayerIsPlaying,
  usePlayerMediaType,
  usePlayerStore,
  usePlayerVolume,
  useReplayGainActions,
  useReplayGainState,
} from '@/store/player.store'
import {
  serverAllowsCors,
  setAudioGraphFallback,
} from '@/utils/audio-graph-fallback'
import { logger } from '@/utils/logger'
import { calculateReplayGain, ReplayGainParams } from '@/utils/replayGain'

type AudioPlayerProps = ComponentPropsWithoutRef<'audio'> & {
  audioRef: RefObject<HTMLAudioElement>
  replayGain?: ReplayGainParams
  /** The song being played (songs only): for the shared error path. */
  songId?: string
}

export function AudioPlayer({
  audioRef,
  replayGain,
  songId,
  ...props
}: AudioPlayerProps) {
  const { t } = useTranslation()
  const [previousGain, setPreviousGain] = useState(1)
  const { replayGainEnabled, replayGainError } = useReplayGainState()
  const { isSong, isRadio, isPodcast } = usePlayerMediaType()
  const { setPlayingState } = usePlayerActions()
  const { setReplayGainError } = useReplayGainActions()
  const { volume } = usePlayerVolume()
  const isPlaying = usePlayerIsPlaying()

  const gainValue = useMemo(() => {
    const audioVolume = volume / 100

    if (!replayGain || !replayGainEnabled) {
      return audioVolume * 1
    }
    const gain = calculateReplayGain(replayGain)

    return audioVolume * gain
  }, [replayGain, replayGainEnabled, volume])

  const { resumeContext, setupGain } = useAudioContext(audioRef.current)

  const ignoreGain = !isSong || replayGainError

  useEffect(() => {
    if (ignoreGain || !audioRef.current) return

    if (gainValue === previousGain) return

    setupGain(gainValue, replayGain)
    setPreviousGain(gainValue)
  }, [audioRef, ignoreGain, gainValue, previousGain, replayGain, setupGain])

  const handleSongError = useCallback(async () => {
    const audio = audioRef.current
    if (!audio) return

    logger.error('Audio load error', {
      src: audio.src,
      networkState: audio.networkState,
      readyState: audio.readyState,
      error: audio.error,
    })

    // Only drop the audio graph (EQ, visualizer) when the server answers but
    // refuses cross-origin audio; a bad file or a server that is down must
    // not turn them off. The fallback lasts this session.
    if (
      !replayGainError &&
      (await serverAnswers()) &&
      !(await serverAllowsCors(audio.src))
    ) {
      setAudioGraphFallback(true)
      setReplayGainError(true)
      window.location.reload()
      return
    }

    if (!songId) return
    handlePlaybackError(songId, () => {
      // load() pauses a playing element (and the store with it).
      const wasPlaying = usePlayerStore.getState().playerState.isPlaying
      audio.load()
      if (wasPlaying) {
        usePlayerStore.getState().actions.setPlayingState(true)
        audio.play().catch(() => undefined)
      }
    })
  }, [audioRef, replayGainError, setReplayGainError, songId])

  const handleRadioError = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return

    toast.error(t('radios.error'))
    setPlayingState(false)
  }, [audioRef, setPlayingState, t])

  useEffect(() => {
    async function handleSong() {
      const audio = audioRef.current
      if (!audio) return

      try {
        if (isPlaying) {
          if (isSong) await resumeContext()
          await audio.play()
        } else {
          audio.pause()
        }
      } catch (error) {
        // play() is interrupted when the song changes quickly; not an error.
        if ((error as DOMException)?.name === 'AbortError') return
        // The source failed: the element's error event handles it.
        if (audio.error) return
        logger.error('Audio playback failed', error)
        handleSongError()
      }
    }
    if (isSong || isPodcast) handleSong()
  }, [audioRef, handleSongError, isPlaying, isSong, isPodcast, resumeContext])

  useEffect(() => {
    async function handleRadio() {
      const audio = audioRef.current
      if (!audio) return

      if (isPlaying) {
        audio.load()
        await audio.play()
      } else {
        audio.pause()
      }
    }
    if (isRadio) handleRadio()
  }, [audioRef, isPlaying, isRadio])

  const handleError = useMemo(() => {
    if (isSong) return handleSongError
    if (isRadio) return handleRadioError

    return undefined
  }, [handleRadioError, handleSongError, isRadio, isSong])

  // Playback speed (pitch is preserved by the browser).
  const speed = useAudioFx((s) => s.speed)
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-apply when the source changes
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !isSong) return
    audio.defaultPlaybackRate = speed
    audio.playbackRate = speed
  }, [audioRef, speed, isSong, props.src])

  const crossOrigin = useMemo(() => {
    if (!isSong || replayGainError) return undefined

    return 'anonymous'
  }, [isSong, replayGainError])

  return (
    <audio
      ref={audioRef}
      {...props}
      crossOrigin={crossOrigin}
      onError={handleError}
    />
  )
}
