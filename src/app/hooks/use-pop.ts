import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * A one-off "pop" animation flag, e.g. for a heart being filled. Call
 * `trigger()` from the click handler; `popping` is true for `duration` ms.
 */
export function usePop(duration = 360) {
  const [popping, setPopping] = useState(false)
  const timer = useRef<number>()

  const trigger = useCallback(() => {
    window.clearTimeout(timer.current)
    setPopping(false)
    // Next frame, so a repeated trigger restarts the animation.
    requestAnimationFrame(() => {
      setPopping(true)
      timer.current = window.setTimeout(() => setPopping(false), duration)
    })
  }, [duration])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  return { popping, trigger }
}
