import { ScrobblingSettings } from '../clearplay/scrobbling'
import { StreamingSettings } from '../clearplay/streaming'
import { LyricsSettings } from './lyrics'
import { ReplayGainConfig } from './replay-gain'

export function Audio() {
  return (
    <div className="space-y-4">
      <StreamingSettings />
      <ScrobblingSettings />
      <ReplayGainConfig />
      <LyricsSettings />
    </div>
  )
}
