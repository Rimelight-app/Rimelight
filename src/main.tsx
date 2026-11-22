import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import 'react-lazy-load-image-component/src/effects/opacity.css'
import 'react-toastify/dist/ReactToastify.css'

import '@fontsource-variable/inter'
import '@/themes.css'
import '@/index.css'

import '@/i18n'

import App from '@/App'

import { queryClient } from '@/lib/queryClient'
import { initMpvEngine } from '@/service/mpv-player'
import { blockFeatures } from '@/utils/browser'
import { installTestHook } from '@/utils/test-hook'

blockFeatures()
installTestHook()

// The audio engine (built-in or mpv) must be known before the player renders.
const engineReady = Promise.race([
  initMpvEngine(),
  new Promise((resolve) => setTimeout(resolve, 3000)),
])

engineReady.finally(() => {
  createRoot(document.getElementById('root') as HTMLElement).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </StrictMode>,
  )
})
