import { useAppStore } from '@/store/app.store'
import { useAudioFx } from '@/store/audio-fx.store'
import { usePlayerStore } from '@/store/player.store'
import { useRatingsStore } from '@/store/ratings.store'
import { resolveOutputDevice } from './output-device'

/**
 * Exposes the player store to the automated UI tests (tools/dev-rig/e2e.mjs),
 * only when the app was started by them (CLEARPLAY_E2E=1 adds ?e2e=1).
 * Tests read state through it; they still click the real buttons.
 */
export function installTestHook() {
  if (new URLSearchParams(window.location.search).get('e2e') !== '1') return
  Object.assign(window, {
    __cp: {
      app: useAppStore,
      player: usePlayerStore,
      ratings: useRatingsStore,
      audioFx: useAudioFx,
      resolveOutputDevice,
    },
  })
}
