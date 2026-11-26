import { InterfaceSettings } from '../rimelight/interface'
import { EffectsSettings } from './effects'
import { FullscreenSettings } from './fullscreen'

export function Appearance() {
  return (
    <div className="space-y-4">
      <InterfaceSettings />
      <FullscreenSettings />
      <EffectsSettings />
    </div>
  )
}
