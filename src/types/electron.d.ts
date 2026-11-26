import { ElectronAPI } from '@electron-toolkit/preload'
import { IRimelightAPI } from '../../electron/preload/types'

export {}

declare global {
  interface Window {
    electron: ElectronAPI
    api: IRimelightAPI
    envVars: {
      XDG_CURRENT_DESKTOP: string | undefined
    }
  }
}
