import { useCallback, useEffect, useRef } from 'react'
import { EQ_BANDS, useAudioFx } from '@/store/audio-fx.store'
import { usePlayerMediaType, useReplayGainState } from '@/store/player.store'
import { logger } from '@/utils/logger'
import { resolveOutputDevice } from '@/utils/output-device'
import { ReplayGainParams } from '@/utils/replayGain'

type Ctx = AudioContext & { setSinkId?: (id: string) => Promise<void> }

/**
 * The live context (for the output readout in Settings) and the last node of
 * the graph, which the Now Playing visualizer listens to.
 */
export const audioEngine: { ctx: Ctx | null; tap: AudioNode | null } = {
  ctx: null,
  tap: null,
}

const dbToGain = (db: number) => 10 ** (db / 20)

/** Routes the context to the saved output device (see output-device.ts). */
function applySink(ctx: Ctx) {
  if (!ctx.setSinkId) return
  resolveOutputDevice()
    .then((sink) => {
      const current = (ctx as Ctx & { sinkId?: string }).sinkId ?? ''
      if (current === sink || ctx.state === 'closed') return
      return ctx.setSinkId?.(sink)
    })
    .catch((e) => logger.error('setSinkId failed', e))
}

/**
 * Playback graph (native Web Audio, Chromium):
 *   <audio> → source → replay-gain → EQ (10 bands) → preamp → mono/stereo → output
 * The graph is built on first play so EQ, mono and output device always apply.
 */
export function useAudioContext(audio: HTMLAudioElement | null) {
  const { isSong } = usePlayerMediaType()
  const { replayGainError, replayGainEnabled } = useReplayGainState()

  const audioContextRef = useRef<Ctx | null>(null)
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)
  const eqRef = useRef<BiquadFilterNode[]>([])
  const preampRef = useRef<GainNode | null>(null)
  const monoRef = useRef<GainNode | null>(null)

  const applyFx = useCallback(() => {
    const ctx = audioContextRef.current
    if (!ctx) return
    const { eqEnabled, eqGains, preamp, mono } = useAudioFx.getState()
    const t = ctx.currentTime
    eqRef.current.forEach((f, i) => {
      f.gain.setTargetAtTime(eqEnabled ? (eqGains[i] ?? 0) : 0, t, 0.03)
    })
    preampRef.current?.gain.setTargetAtTime(
      eqEnabled ? dbToGain(preamp) : 1,
      t,
      0.03,
    )
    if (monoRef.current) monoRef.current.channelCount = mono ? 1 : 2
    applySink(ctx)
  }, [])

  const setupAudioContext = useCallback(() => {
    if (!audio || !isSong || replayGainError) return

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext({
        latencyHint: 'playback',
      }) as Ctx
      audioEngine.ctx = audioContextRef.current
    }
    const ctx = audioContextRef.current

    if (!sourceNodeRef.current) {
      sourceNodeRef.current = ctx.createMediaElementSource(audio)
    }

    if (!gainNodeRef.current) {
      gainNodeRef.current = ctx.createGain()
      eqRef.current = EQ_BANDS.map((freq, i) => {
        const f = ctx.createBiquadFilter()
        f.type =
          i === 0
            ? 'lowshelf'
            : i === EQ_BANDS.length - 1
              ? 'highshelf'
              : 'peaking'
        f.frequency.value = freq
        f.Q.value = 1.1
        f.gain.value = 0
        return f
      })
      preampRef.current = ctx.createGain()
      monoRef.current = ctx.createGain()
      monoRef.current.channelCountMode = 'explicit'
      monoRef.current.channelInterpretation = 'speakers'

      let node: AudioNode = sourceNodeRef.current
      for (const next of [
        gainNodeRef.current,
        ...eqRef.current,
        preampRef.current,
        monoRef.current,
      ]) {
        node.connect(next)
        node = next
      }
      node.connect(ctx.destination)
      audioEngine.tap = node
      applyFx()
    }
  }, [audio, isSong, replayGainError, applyFx])

  // Re-apply whenever the effect settings change.
  useEffect(() => useAudioFx.subscribe(() => applyFx()), [applyFx])

  // A saved device that is plugged in later (USB DAC, headphones) is picked
  // up without a restart.
  useEffect(() => {
    const onChange = () => {
      if (audioContextRef.current) applySink(audioContextRef.current)
    }
    navigator.mediaDevices?.addEventListener('devicechange', onChange)
    return () =>
      navigator.mediaDevices?.removeEventListener('devicechange', onChange)
  }, [])

  const resumeContext = useCallback(async () => {
    if (!isSong) return
    if (!audioContextRef.current) setupAudioContext()
    const audioContext = audioContextRef.current
    if (!audioContext) return

    logger.info('AudioContext State', { state: audioContext.state })

    if (audioContext.state === 'suspended') {
      await audioContext.resume()
    }
    if (audioContext.state === 'closed') {
      setupAudioContext()
    }
  }, [isSong, setupAudioContext])

  const setupGain = useCallback(
    (gainValue: number, replayGain?: ReplayGainParams) => {
      setupAudioContext()

      if (!audioContextRef.current || !gainNodeRef.current) return

      if (!gainValue || Number.isNaN(gainValue)) {
        logger.error('Invalid gain value', { gainValue })
        return
      }

      logger.info('Replay Gain Status', {
        enabled: replayGainEnabled,
        gainValue,
        ...replayGain,
      })

      gainNodeRef.current.gain.setValueAtTime(
        gainValue,
        audioContextRef.current.currentTime,
      )
    },
    [replayGainEnabled, setupAudioContext],
  )

  const resetRefs = useCallback(() => {
    for (const n of [
      sourceNodeRef.current,
      gainNodeRef.current,
      ...eqRef.current,
      preampRef.current,
      monoRef.current,
    ]) {
      n?.disconnect()
    }
    audioEngine.tap = null
    sourceNodeRef.current = null
    gainNodeRef.current = null
    eqRef.current = []
    preampRef.current = null
    monoRef.current = null
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
      audioEngine.ctx = null
    }
  }, [])

  useEffect(() => {
    if (replayGainError) resetRefs()
  }, [replayGainError, resetRefs])

  // biome-ignore lint/correctness/useExhaustiveDependencies: clear state after unmount
  useEffect(() => {
    return () => resetRefs()
  }, [])

  return {
    audioContextRef,
    sourceNodeRef,
    gainNodeRef,
    setupAudioContext,
    resumeContext,
    setupGain,
    resetRefs,
  }
}
