import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface EffectsState {
  reduceEffects: boolean
  setReduceEffects: (value: boolean) => void
}

/** Rimelight visual-effects preference (blur, drifting gradients). */
export const useEffectsStore = create<EffectsState>()(
  persist(
    (set) => ({
      reduceEffects: false,
      setReduceEffects: (value) => set({ reduceEffects: value }),
    }),
    { name: 'clearplay_effects' },
  ),
)
