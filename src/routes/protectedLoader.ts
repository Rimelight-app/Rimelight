import { redirect } from 'react-router-dom'
import { ROUTES } from '@/routes/routesList'
import { markUnreachable } from '@/service/connection'
import { subsonic } from '@/service/subsonic'
import { useAppStore } from '@/store/app.store'

export async function protectedLoader() {
  const { url, password, isServerConfigured } = useAppStore.getState().data
  const hasNoUrl = !url || url === ''
  const hasNoToken = !password || password === ''

  if (hasNoUrl || hasNoToken || !isServerConfigured)
    return redirect(ROUTES.SERVER_CONFIG)

  const info = await subsonic.ping.pingInfo().catch(() => undefined)
  if (info?.status === 'ok') return null
  // No answer (server off, network down): open the app anyway and keep
  // asking; local songs and the saved queue still work. Only a server that
  // answers and rejects the login sends you to the server page.
  if (info === undefined) {
    markUnreachable('startup')
    return null
  }
  return redirect(ROUTES.SERVER_CONFIG)
}

export async function podcastsLoader() {
  const { active } = useAppStore.getState().podcasts

  if (!active) {
    return redirect(ROUTES.LIBRARY.HOME)
  }

  return null
}
