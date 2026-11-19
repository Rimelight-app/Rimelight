import { FolderPlus, Loader2, RefreshCw, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'react-toastify'
import {
  Content,
  ContentSeparator,
  Header,
  HeaderDescription,
  HeaderTitle,
  Root,
} from '@/app/components/settings/section'
import { LOCAL_SCAN_EVENT } from '@/app/observers/local-library-observer'
import { cn } from '@/lib/utils'
import {
  connectLocalLibrary,
  hasLocalLibrary,
  isLocalServer,
  localLibraryState,
} from '@/service/local-library'
import { useAppStore } from '@/store/app.store'
import { switchToServer } from '@/store/servers.store'
import type { LocalLibraryState } from '../../../../../../electron/preload/types'

const pill =
  'glass-chip inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium text-white/80 transition-colors hover:bg-white/[0.14] hover:text-white disabled:opacity-40'

/** Settings → Servers: folders on this computer, served as "This computer". */
export function LocalLibrarySettings() {
  const { t } = useTranslation()
  const [state, setState] = useState<LocalLibraryState | null>(null)
  const [busy, setBusy] = useState(false)
  const { url, username } = useAppStore((s) => s.data)
  const inUse = isLocalServer(url, username)
  const k = 'clearplay.local'

  const refresh = useCallback(async () => {
    const next = await localLibraryState().catch(() => null)
    setState(next)
    return next
  }, [])

  // Follow a running scan.
  useEffect(() => {
    if (!hasLocalLibrary()) return
    let timer = 0
    const tick = async () => {
      const next = await refresh()
      if (next?.scanning) timer = window.setTimeout(tick, 800)
    }
    tick()
    const onScan = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(tick, 300)
    }
    window.addEventListener(LOCAL_SCAN_EVENT, onScan)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener(LOCAL_SCAN_EVENT, onScan)
    }
  }, [refresh])

  if (!hasLocalLibrary()) return null

  const changed = (next: LocalLibraryState) => {
    setState(next)
    window.dispatchEvent(new Event(LOCAL_SCAN_EVENT))
  }

  async function use() {
    setBusy(true)
    const server = await connectLocalLibrary().catch(() => null)
    setBusy(false)
    if (!server) {
      toast.error(t(`${k}.failed`))
      return
    }
    switchToServer(server)
  }

  return (
    <Root>
      <Header>
        <HeaderTitle>{t(`${k}.group`)}</HeaderTitle>
        <HeaderDescription>{t(`${k}.description`)}</HeaderDescription>
      </Header>
      <Content>
        {state?.folders.length ? (
          <ul className="space-y-1.5" data-testid="local-folders">
            {state.folders.map((folder) => (
              <li
                key={folder}
                className="flex items-center gap-3 rounded-2xl bg-white/[0.04] px-4 py-2.5 ring-1 ring-white/[0.06]"
              >
                <span className="min-w-0 flex-1 truncate text-[13px] text-white/85">
                  {folder}
                </span>
                <button
                  type="button"
                  aria-label={t(`${k}.remove`, { folder })}
                  title={t(`${k}.remove`, { folder })}
                  className="flex size-7 items-center justify-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                  onClick={async () =>
                    changed(await window.api.localLibrary.removeFolder(folder))
                  }
                >
                  <X className="size-3.5" strokeWidth={1.75} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-white/50">{t(`${k}.noFolders`)}</p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={pill}
            data-testid="local-add-folder"
            onClick={async () =>
              changed(await window.api.localLibrary.addFolder())
            }
          >
            <FolderPlus className="size-3.5" strokeWidth={1.75} />
            {t(`${k}.addFolder`)}
          </button>
          {Boolean(state?.folders.length) && (
            <button
              type="button"
              className={pill}
              disabled={state?.scanning}
              onClick={async () =>
                changed(await window.api.localLibrary.rescan())
              }
            >
              <RefreshCw
                className={cn('size-3.5', state?.scanning && 'animate-spin')}
                strokeWidth={1.75}
              />
              {t(`${k}.rescan`)}
            </button>
          )}
          {Boolean(state?.folders.length) &&
            (inUse ? (
              <span className="inline-flex h-8 items-center rounded-full bg-white/[0.12] px-3 text-[12px] font-medium text-white">
                {t(`${k}.inUse`)}
              </span>
            ) : (
              <button
                type="button"
                className={pill}
                disabled={busy}
                onClick={use}
                data-testid="local-use"
              >
                {busy && <Loader2 className="size-3.5 animate-spin" />}
                {t(`${k}.use`)}
              </button>
            ))}
          {state && state.folders.length > 0 && (
            <span
              className="ml-1 text-[12px] tabular-nums text-white/50"
              data-testid="local-status"
            >
              {state.scanning
                ? t(`${k}.scanning`, { count: state.scanned })
                : t(`${k}.status`, {
                    count: state.tracks,
                    albums: state.albums,
                  })}
            </span>
          )}
        </div>
      </Content>
      <ContentSeparator />
    </Root>
  )
}
