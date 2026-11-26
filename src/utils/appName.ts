import { repository, version } from '@/../package.json'
import { DESKTOP_APP } from '@/service/queue-handoff'

export const appName = 'Rimelight'

/**
 * The Subsonic client name (`c`) sent with every server request. It stays
 * "ClearPlay" after the rename: "Continue on other devices" matches on it
 * (Navidrome's changedBy / playerName, see service/queue-handoff.ts), and
 * ClearPlay for Android 1.6.0 looks for exactly this value. Change it only
 * together with the Android app, in a new version of the handoff rules.
 */
export const subsonicClient = DESKTOP_APP

export function getAppInfo() {
  return {
    name: appName,
    version,
    url: repository.url,
    releaseUrl: `${repository.url}/releases/latest`,
  }
}

export const lrclibClient = `${appName} v${version} (${repository.url})`
