import { memo, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { FullscreenMode } from '@/app/components/fullscreen/page'
import { AppBackdrop } from '@/app/components/glass/app-backdrop'
import { NavRail } from '@/app/components/glass/nav-rail'
import { SidePanel } from '@/app/components/glass/side-panel'
import { Player } from '@/app/components/player/player'
import { CreatePlaylistDialog } from '@/app/components/playlist/form-dialog'
import { RemovePlaylistDialog } from '@/app/components/playlist/remove-dialog'
import { SongInfoDialog } from '@/app/components/song/info-dialog'
import {
  MainSidebarInset,
  MainSidebarProvider,
} from '@/app/components/ui/main-sidebar'
import { Header } from '@/app/layout/header'
import { cn } from '@/lib/utils'
import { useClearPlaySettings } from '@/store/clearplay-settings.store'
import {
  useLyricsState,
  useMainDrawerState,
  useQueueState,
} from '@/store/player.store'
import { MainRoutes } from './main'

const MemoHeader = memo(Header)
const MemoPlayer = memo(Player)
const MemoSongInfoDialog = memo(SongInfoDialog)
const MemoRemovePlaylistDialog = memo(RemovePlaylistDialog)
const MemoFullscreenMode = memo(FullscreenMode)

let startPageApplied = false

/** Opens the page chosen in Settings → Appearance once per launch. */
function useStartPage() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const startPage = useClearPlaySettings((s) => s.startPage)

  // biome-ignore lint/correctness/useExhaustiveDependencies: only on first mount
  useEffect(() => {
    if (startPageApplied) return
    startPageApplied = true
    if (pathname === '/' && startPage !== '/')
      navigate(startPage, { replace: true })
  }, [])
}

export default function BaseLayout() {
  useStartPage()
  const { mainDrawerState } = useMainDrawerState()
  const { lyricsState } = useLyricsState()
  const { queueState } = useQueueState()
  const panelOpen = mainDrawerState && (lyricsState || queueState)

  return (
    <div className="h-screen w-screen overflow-hidden">
      <AppBackdrop />
      <MainSidebarProvider className="bg-transparent">
        <MemoHeader />
        <NavRail />
        <MainSidebarInset
          className={cn(
            'w-full bg-transparent pl-[--content-inset-left] pr-3 transition-[padding] duration-300',
            panelOpen && 'pr-[calc(var(--side-panel-width)+24px)]',
          )}
        >
          <MainRoutes />
        </MainSidebarInset>
        <SidePanel />
        <MemoPlayer />
      </MainSidebarProvider>
      <MemoSongInfoDialog />
      <MemoRemovePlaylistDialog />
      <CreatePlaylistDialog />
      <MemoFullscreenMode />
    </div>
  )
}
