import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface EffectsState {
  reduceEffects: boolean
  setReduceEffects: (value: boolean) => void
  showVisualizer: boolean
  setShowVisualizer: (value: boolean) => void
}

/** ClearPlay visual-effects preference (blur, drifting gradients). */
export const useEffectsStore = create<EffectsState>()(
  persist(
    (set) => ({
      reduceEffects: false,
      setReduceEffects: (value) => set({ reduceEffects: value }),
      showVisualizer: true,
      setShowVisualizer: (value) => set({ showVisualizer: value }),
    }),
    { name: 'clearplay_effects' },
  ),
)
