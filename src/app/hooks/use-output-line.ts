import { useMemo } from 'react'
import { useMpvRuntime } from '@/store/bitperfect.store'
import { usePlayerStore } from '@/store/player.store'
import { describeOutput } from '@/utils/bitperfect'

/** How the playing song reaches the device (mpv engine), in plain words. */
export function useOutputLine() {
  const output = useMpvRuntime((s) => s.output)
  const bitDepth = usePlayerStore((s) =>
    s.playerState.mediaType === 'song'
      ? s.songlist.currentSong?.bitDepth
      : undefined,
  )
  const samplingRate = usePlayerStore((s) =>
    s.playerState.mediaType === 'song'
      ? s.songlist.currentSong?.samplingRate
      : undefined,
  )
  return useMemo(
    () => describeOutput(output, { bitDepth, samplingRate }),
    [output, bitDepth, samplingRate],
  )
}
