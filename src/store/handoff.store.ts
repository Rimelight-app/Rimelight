import { create } from 'zustand'
import type { Offer, SavedQueue } from '@/service/queue-handoff'
import type { ISong } from '@/types/responses/song'

/**
 * "Continue on other devices": what is on screen right now (not persisted;
 * handledChanged, which is, lives in the settings store).
 */
interface HandoffState {
  /** The Continue offer and the saved queue it came from. */
  offer: { offer: Offer<ISong>; queue: SavedQueue<ISong> } | null
  /** "Continued on <device>". While it shows, nothing is saved. */
  leftBehind: { device: string; song: ISong | null } | null
  /** Left behind was already shown since this device last saved. */
  leftBehindShown: boolean
  /** The latest `changed` this device has seen on the server. */
  latestChanged: string | null
}

export const useHandoffStore = create<HandoffState>()(() => ({
  offer: null,
  leftBehind: null,
  leftBehindShown: false,
  latestChanged: null,
}))
