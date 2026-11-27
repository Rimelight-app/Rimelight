import { IRimelightAPI } from '../../electron/preload/types'

export {}

declare global {
  interface Window {
    api: IRimelightAPI
    envVars: {
      XDG_CURRENT_DESKTOP: string | undefined
    }
  }
}
