import { QueueSettings } from '../clearplay/queue'
import { ScrobblingSettings } from '../clearplay/scrobbling'
import { SoundSettings } from '../clearplay/sound'
import { StreamingSettings } from '../clearplay/streaming'
import { LyricsSettings } from './lyrics'
import { ReplayGainConfig } from './replay-gain'

export function Audio() {
  return (
    <div className="space-y-4">
      <SoundSettings />
      <QueueSettings />
      <StreamingSettings />
      <ScrobblingSettings />
      <ReplayGainConfig />
      <LyricsSettings />
    </div>
  )
}
