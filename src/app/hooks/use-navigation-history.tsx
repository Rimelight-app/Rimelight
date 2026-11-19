import { useEffect, useState } from 'react'
import { useNavigate, useNavigationType } from 'react-router-dom'
import { usePlayerStore } from '@/store/player.store'
import { MouseButton } from '@/utils/browser'
import { isMacOS } from '@/utils/desktop'

const SWIPE_THRESHOLD = 60 // minimum deltaX to count as a navigation gesture
const SWIPE_COOLDOWN = 500 // ms before another swipe can fire

const useNavigationHistory = () => {
  const navigationType = useNavigationType()
  const navigate = useNavigate()

  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)

  // biome-ignore lint/correctness/useExhaustiveDependencies: using navigationType to trigger
  useEffect(() => {
    setCanGoBack(false)
    setCanGoForward(false)

    const handleHistoryChange = () => {
      setCanGoBack(window.history.state?.idx > 0)
      setCanGoForward(window.history.state?.idx < window.history.length - 1)
    }

    handleHistoryChange()

    window.addEventListener('popstate', handleHistoryChange)

    return () => {
      window.removeEventListener('popstate', handleHistoryChange)
    }
  }, [navigationType])

  const goBack = () => {
    if (canGoBack) navigate(-1)
  }

  const goForward = () => {
    if (canGoForward) navigate(1)
  }

  // Mouse back/forward buttons (3/4) on every system. Electron does not
  // navigate on them by itself. Back first closes the fullscreen player if
  // it is open. Reads window.history.state directly to avoid stale closures.
  useEffect(() => {
    const handleMouseButtons = (e: MouseEvent) => {
      if (e.button !== MouseButton.Back && e.button !== MouseButton.Forward) {
        return
      }
      e.preventDefault()
      if (e.button === MouseButton.Back) {
        const { fullscreen } = usePlayerStore.getState()
        if (fullscreen.isFullscreen) {
          fullscreen.setIsFullscreen(false)
        } else if (window.history.state?.idx > 0) {
          navigate(-1)
        }
      } else if (window.history.state?.idx < window.history.length - 1) {
        navigate(1)
      }
    }
    // Some systems also start a native back/forward on mousedown.
    const swallow = (e: MouseEvent) => {
      if (e.button === MouseButton.Back || e.button === MouseButton.Forward) {
        e.preventDefault()
      }
    }

    window.addEventListener('mouseup', handleMouseButtons)
    window.addEventListener('mousedown', swallow)
    return () => {
      window.removeEventListener('mouseup', handleMouseButtons)
      window.removeEventListener('mousedown', swallow)
    }
  }, [navigate])

  // Mac only: two-finger swipe gesture for in-app navigation.
  // The wheel event fires when the trackpad produces horizontal overscroll (no
  // scrollable content to consume deltaX), which is the back/forward gesture.
  // A cooldown prevents repeated firings from a single swipe.
  useEffect(() => {
    if (!isMacOS) return

    let lastFired = 0

    const handleWheel = (e: WheelEvent) => {
      const now = Date.now()
      const isHorizontalDominant = Math.abs(e.deltaX) > Math.abs(e.deltaY)

      if (!isHorizontalDominant || Math.abs(e.deltaX) < SWIPE_THRESHOLD) return
      if (now - lastFired < SWIPE_COOLDOWN) return

      lastFired = now

      if (e.deltaX < 0 && window.history.state?.idx > 0) navigate(-1)
      if (e.deltaX > 0 && window.history.state?.idx < window.history.length - 1)
        navigate(1)
    }

    window.addEventListener('wheel', handleWheel, { passive: true })
    return () => window.removeEventListener('wheel', handleWheel)
  }, [navigate])

  return { canGoBack, canGoForward, goBack, goForward }
}

export default useNavigationHistory
