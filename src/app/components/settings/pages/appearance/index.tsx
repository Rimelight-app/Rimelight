import { EffectsSettings } from './effects'
import { FullscreenSettings } from './fullscreen'

export function Appearance() {
  return (
    <div className="space-y-4">
      <FullscreenSettings />
      <EffectsSettings />
    </div>
  )
}
