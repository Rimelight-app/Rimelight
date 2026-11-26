import { isDesktop } from '@/utils/desktop'
import { AudioEngineSettings } from '../rimelight/audio-engine'
import { QueueSettings } from '../rimelight/queue'
import { ScrobblingSettings } from '../rimelight/scrobbling'
import { SoundSettings } from '../rimelight/sound'
import { StreamingSettings } from '../rimelight/streaming'
import { LyricsSettings } from './lyrics'
import { ReplayGainConfig } from './replay-gain'

export function Audio() {
  return (
    <div className="space-y-4">
      {isDesktop() && <AudioEngineSettings />}
      <SoundSettings />
      <QueueSettings />
      <StreamingSettings />
      <ScrobblingSettings />
      <ReplayGainConfig />
      <LyricsSettings />
    </div>
  )
}
