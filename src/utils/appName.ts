import { repository, version } from '@/../package.json'
import { DESKTOP_APP } from '@/service/queue-handoff'

export const appName = 'Rimelight'

/**
 * The Subsonic client name (`c`) sent with every server request: Navidrome's
 * changedBy / playerName, which "Continue on other devices" matches on (see
 * service/queue-handoff.ts). "Rimelight" since 0.6.2; the phone app still
 * recognises the old "ClearPlay" through the handoff rules' LEGACY_NAMES.
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
