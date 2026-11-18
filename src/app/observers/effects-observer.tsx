import { useLayoutEffect } from 'react'
import { useEffectsStore } from '@/store/effects.store'

export function EffectsObserver() {
  const reduceEffects = useEffectsStore((state) => state.reduceEffects)

  useLayoutEffect(() => {
    document.documentElement.classList.toggle('reduce-effects', reduceEffects)
  }, [reduceEffects])

  return null
}
