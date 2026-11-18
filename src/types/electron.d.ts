import { ElectronAPI } from '@electron-toolkit/preload'
import { IClearPlayAPI } from '../../electron/preload/types'

export {}

declare global {
  interface Window {
    electron: ElectronAPI
    api: IClearPlayAPI
    envVars: {
      XDG_CURRENT_DESKTOP: string | undefined
    }
  }
}
