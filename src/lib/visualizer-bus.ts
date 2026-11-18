import type { IAnalyserNode, IAudioContext } from 'standardized-audio-context'

type Analyser = IAnalyserNode<IAudioContext>

let analyser: Analyser | null = null

/** Shares the playback AnalyserNode with the visualiser without React state. */
export const visualizerBus = {
  set(node: Analyser | null) {
    analyser = node
  },
  get() {
    return analyser
  },
}
