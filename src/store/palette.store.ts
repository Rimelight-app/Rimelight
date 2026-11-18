import { create } from 'zustand'

export type RGB = [number, number, number]

export const FALLBACK_PALETTE: RGB[] = [
  [150, 120, 230],
  [90, 140, 230],
  [230, 110, 180],
  [30, 30, 50],
]

interface PaletteState {
  palette: RGB[]
  setPalette: (palette: RGB[]) => void
}

/** Colours of the current cover, shared by the backdrop and the visualiser. */
export const usePaletteStore = create<PaletteState>()((set) => ({
  palette: FALLBACK_PALETTE,
  setPalette: (palette) => set({ palette }),
}))
