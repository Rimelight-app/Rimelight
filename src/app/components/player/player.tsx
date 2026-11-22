import { memo, useCallback, useEffect, useMemo, useRef } from 'react'
import { getSongStreamUrl } from '@/api/httpClient'
import { getProxyURL } from '@/api/podcastClient'
import { MiniPlayerButton } from '@/app/components/mini-player/button'
import { RadioInfo } from '@/app/components/player/radio-info'
import { TrackInfo } from '@/app/components/player/track-info'
import { podcasts } from '@/service/podcasts'
import { useAppMediaCache, useAppStore } from '@/store/app.store'
import { useIsMpvSession } from '@/store/bitperfect.store'
import { useClearPlaySettings } from '@/store/clearplay-settings.store'
import {
  getVolume,
  usePlayerActions,
  usePlayerIsPlaying,
  usePlayerLoop,
  usePlayerMediaType,
  usePlayerRef,
  usePlayerSonglist,
  usePlayerStore,
  useReplayGainState,
} from '@/store/player.store'
import { LoopState } from '@/types/playerContext'
import { ensureSupportForAlac } from '@/utils/alac'
import { hasPiPSupport } from '@/utils/browser'
import { logger } from '@/utils/logger'
import { ReplayGainParams } from '@/utils/replayGain'
import { AudioPlayer } from './audio'
import { PlayerClearQueueButton } from './clear-queue-button'
import { PlayerControls } from './controls'
import { PlayerExpandButton } from './expand-button'
import { PlayerLikeButton } from './like-button'
import { PlayerLyricsButton } from './lyrics-button'
import { MediaSessionKeeper, MpvAudio } from './mpv-audio'
import { PodcastInfo } from './podcast-info'
import { PodcastPlaybackRate } from './podcast-playback-rate'
import { PlayerProgress } from './progress'
import { PlayerQueueButton } from './queue-button'
import { SleepTimerButton } from './sleep-timer'
import { PlayerVolume } from './volume'

const MemoTrackInfo = memo(TrackInfo)
const MemoRadioInfo = memo(RadioInfo)
const MemoPodcastInfo = memo(PodcastInfo)
const MemoPlayerControls = memo(PlayerControls)
const MemoPlayerProgress = memo(PlayerProgress)
const MemoPlayerLikeButton = memo(PlayerLikeButton)
const MemoPlayerQueueButton = memo(PlayerQueueButton)
const MemoPlayerClearQueueButton = memo(PlayerClearQueueButton)
const MemoPlayerVolume = memo(PlayerVolume)
const MemoPlayerExpandButton = memo(PlayerExpandButton)
const MemoPodcastPlaybackRate = memo(PodcastPlaybackRate)
const MemoLyricsButton = memo(PlayerLyricsButton)
const MemoMiniPlayerButton = memo(MiniPlayerButton)

export function Player() {
  const hideFavoritesSection = useAppStore().pages.hideFavoritesSection
  const audioRef = useRef<HTMLAudioElement>(null)
  const radioRef = useRef<HTMLAudioElement>(null)
  const podcastRef = useRef<HTMLAudioElement>(null)
  const {
    setAudioPlayerRef,
    setCurrentDuration,
    setProgress,
    setPlayingState,
    handleSongEnded,
    getCurrentProgress,
    getCurrentPodcastProgress,
  } = usePlayerActions()
  const { currentList, currentSongIndex, radioList, podcastList } =
    usePlayerSonglist()
  const isPlaying = usePlayerIsPlaying()
  const { isSong, isRadio, isPodcast } = usePlayerMediaType()
  const loopState = usePlayerLoop()
  const audioPlayerRef = usePlayerRef()
  // Select only the rate: reading the whole store re-rendered the player on
  // every progress tick.
  const currentPlaybackRate = usePlayerStore(
    (state) => state.playerState.currentPlaybackRate,
  )
  const { replayGainType, replayGainPreAmp, replayGainDefaultGain } =
    useReplayGainState()

  const song = currentList[currentSongIndex]
  const radio = radioList[currentSongIndex]
  const podcast = podcastList[currentSongIndex]

  const mediaCacheEnabled = useAppMediaCache()
  const songId = song?.id

  const maxBitRate = useClearPlaySettings((s) => s.maxBitRate)
  const streamFormat = useClearPlaySettings((s) => s.streamFormat)
  // mpv engine: always the original file (bit-perfect needs it untouched).
  const mpv = useIsMpvSession()

  const songBitRate = song?.bitRate ?? 0
  const songSuffix = song?.suffix ?? ''

  // Depends on primitives only: liking or rating the playing song replaces
  // its object in the queue, and a new URL here would restart the track.
  const songStreamUrl = useMemo(() => {
    if (!songId) return ''
    if (mpv) return getSongStreamUrl(songId, '0', 'raw')

    const cacheBustToken = mediaCacheEnabled ? undefined : Date.now().toString()
    // Only ask the server to convert when the file is above the cap.
    const limit = Number(maxBitRate)
    const convert = limit > 0 && songBitRate > limit

    return getSongStreamUrl(
      songId,
      convert ? maxBitRate : undefined,
      convert ? streamFormat : ensureSupportForAlac(songSuffix),
      cacheBustToken,
    )
  }, [
    songId,
    songBitRate,
    songSuffix,
    mediaCacheEnabled,
    maxBitRate,
    streamFormat,
    mpv,
  ])

  const getAudioRef = useCallback(() => {
    if (isRadio) return radioRef
    if (isPodcast) return podcastRef

    return audioRef
  }, [isPodcast, isRadio])

  // biome-ignore lint/correctness/useExhaustiveDependencies: audioRef needed
  useEffect(() => {
    if (!isSong && !song) return

    if (audioPlayerRef === null && audioRef.current)
      setAudioPlayerRef(audioRef.current)
  }, [audioPlayerRef, audioRef, isSong, setAudioPlayerRef, song])

  useEffect(() => {
    const audio = podcastRef.current
    if (!audio || !isPodcast) return

    audio.playbackRate = currentPlaybackRate
  }, [currentPlaybackRate, isPodcast])

  const setupDuration = useCallback(() => {
    const audio = getAudioRef().current
    if (!audio) return

    const audioDuration = Math.floor(audio.duration)
    const infinityDuration = audioDuration === Infinity

    if (!infinityDuration) {
      setCurrentDuration(audioDuration)
    } else if (isSong && song?.duration) {
      setCurrentDuration(song.duration)
    }

    if (isPodcast && infinityDuration && podcast) {
      setCurrentDuration(podcast.duration)
    }

    if (isPodcast) {
      const podcastProgress = getCurrentPodcastProgress()

      logger.info('[Player] - Resuming episode from:', {
        seconds: podcastProgress,
      })

      setProgress(podcastProgress)
      audio.currentTime = podcastProgress
    } else {
      const progress = getCurrentProgress()
      audio.currentTime = progress
    }
  }, [
    getAudioRef,
    isPodcast,
    isSong,
    song,
    podcast,
    setCurrentDuration,
    getCurrentPodcastProgress,
    setProgress,
    getCurrentProgress,
  ])

  const setupProgress = useCallback(() => {
    const audio = getAudioRef().current
    if (!audio) return

    const currentProgress = Math.floor(audio.currentTime)
    setProgress(currentProgress)
  }, [getAudioRef, setProgress])

  const setupInitialVolume = useCallback(() => {
    const audio = getAudioRef().current
    if (!audio) return

    audio.volume = getVolume() / 100
  }, [getAudioRef])

  const sendFinishProgress = useCallback(() => {
    if (!isPodcast || !podcast) return

    podcasts
      .saveEpisodeProgress(podcast.id, podcast.duration)
      .then(() => {
        logger.info('Complete progress sent:', podcast.duration)
      })
      .catch((error) => {
        logger.error('Error sending complete progress', error)
      })
  }, [isPodcast, podcast])

  const trackReplayGain = useMemo<ReplayGainParams>(() => {
    const preAmp = replayGainPreAmp
    const defaultGain = replayGainDefaultGain

    if (!song || !song.replayGain) {
      return { gain: defaultGain, peak: 1, preAmp }
    }

    if (replayGainType === 'album') {
      let { albumGain = defaultGain, albumPeak = 1 } = song.replayGain

      if (albumGain === 0) {
        albumGain = defaultGain
      }

      return { gain: albumGain, peak: albumPeak, preAmp }
    }

    let { trackGain = defaultGain, trackPeak = 1 } = song.replayGain

    if (trackGain === 0) {
      trackGain = defaultGain
    }
    return { gain: trackGain, peak: trackPeak, preAmp }
  }, [song, replayGainDefaultGain, replayGainPreAmp, replayGainType])

  return (
    <footer className="cp-player-bar glass-panel h-[76px] flex items-center fixed bottom-3 left-3 right-3 z-40 rounded-[22px]">
      <div className="w-full h-full grid grid-cols-player gap-2 pl-3 pr-4">
        {/* Track Info */}
        <div className="flex items-center gap-2 w-full">
          {isSong && <MemoTrackInfo song={song} />}
          {isRadio && <MemoRadioInfo radio={radio} />}
          {isPodcast && <MemoPodcastInfo podcast={podcast} />}
        </div>
        {/* Main Controls */}
        <div className="col-span-2 flex flex-col justify-center items-center px-4 gap-1">
          <MemoPlayerControls
            song={song}
            radio={radio}
            podcast={podcast}
            audioRef={getAudioRef()}
          />

          {(isSong || isPodcast) && (
            <MemoPlayerProgress audioRef={getAudioRef()} />
          )}
        </div>
        {/* Remain Controls and Volume */}
        <div className="flex items-center w-full justify-end">
          <div className="flex items-center gap-1">
            {isSong && !hideFavoritesSection && (
              <>
                <MemoPlayerLikeButton disabled={!song} />
              </>
            )}
            {isSong && (
              <>
                <MemoLyricsButton disabled={!song} />
                <MemoPlayerQueueButton disabled={!song} />
                <SleepTimerButton />
              </>
            )}
            {isPodcast && <MemoPodcastPlaybackRate />}
            {(isRadio || isPodcast) && (
              <MemoPlayerClearQueueButton disabled={!radio && !podcast} />
            )}

            <MemoPlayerVolume
              audioRef={getAudioRef()}
              disabled={!song && !radio && !podcast}
            />

            {isSong && <MemoPlayerExpandButton disabled={!song} />}
            {isSong && hasPiPSupport && <MemoMiniPlayerButton />}
          </div>
        </div>
      </div>

      {mpv && <MediaSessionKeeper />}

      {mpv && isSong && song && (
        <MpvAudio
          src={songStreamUrl}
          song={song}
          audioRef={audioRef}
          loop={loopState === LoopState.One}
          getStart={getCurrentProgress}
          onPlay={() => setPlayingState(true)}
          onPause={() => setPlayingState(false)}
          onLoadedMetadata={setupDuration}
          onTimeUpdate={setupProgress}
          onEnded={handleSongEnded}
          data-testid="player-song-audio"
        />
      )}

      {mpv && isRadio && radio && (
        <MpvAudio
          src={radio.streamUrl}
          audioRef={radioRef}
          live
          onPlay={() => setPlayingState(true)}
          onPause={() => setPlayingState(false)}
          data-testid="player-radio-audio"
        />
      )}

      {mpv && isPodcast && podcast && (
        <MpvAudio
          src={podcast.audio_url}
          audioRef={podcastRef}
          playbackRate={currentPlaybackRate}
          getStart={getCurrentPodcastProgress}
          onPlay={() => setPlayingState(true)}
          onPause={() => setPlayingState(false)}
          onLoadedMetadata={setupDuration}
          onTimeUpdate={setupProgress}
          onEnded={() => {
            sendFinishProgress()
            handleSongEnded()
          }}
          data-testid="player-podcast-audio"
        />
      )}

      {!mpv && isSong && song && (
        <AudioPlayer
          replayGain={trackReplayGain}
          src={songStreamUrl}
          autoPlay={isPlaying}
          audioRef={audioRef}
          loop={loopState === LoopState.One}
          onPlay={() => setPlayingState(true)}
          onPause={() => setPlayingState(false)}
          onLoadedMetadata={setupDuration}
          onTimeUpdate={setupProgress}
          onEnded={handleSongEnded}
          onLoadStart={setupInitialVolume}
          data-testid="player-song-audio"
        />
      )}

      {!mpv && isRadio && radio && (
        <AudioPlayer
          src={radio.streamUrl}
          autoPlay={isPlaying}
          audioRef={radioRef}
          onPlay={() => setPlayingState(true)}
          onPause={() => setPlayingState(false)}
          onLoadStart={setupInitialVolume}
          data-testid="player-radio-audio"
        />
      )}

      {!mpv && isPodcast && podcast && (
        <AudioPlayer
          src={getProxyURL(podcast.audio_url)}
          autoPlay={isPlaying}
          audioRef={podcastRef}
          preload="auto"
          onPlay={() => setPlayingState(true)}
          onPause={() => setPlayingState(false)}
          onLoadedMetadata={setupDuration}
          onTimeUpdate={setupProgress}
          onEnded={() => {
            sendFinishProgress()
            handleSongEnded()
          }}
          onLoadStart={setupInitialVolume}
          data-testid="player-podcast-audio"
        />
      )}
    </footer>
  )
}
