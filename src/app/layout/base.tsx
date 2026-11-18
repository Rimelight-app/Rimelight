import { memo } from 'react'
import { MainDrawerPage } from '@/app/components/drawer/page'
import { FullscreenMode } from '@/app/components/fullscreen/page'
import { AppBackdrop } from '@/app/components/glass/app-backdrop'
import { NavRail } from '@/app/components/glass/nav-rail'
import { Player } from '@/app/components/player/player'
import { CreatePlaylistDialog } from '@/app/components/playlist/form-dialog'
import { RemovePlaylistDialog } from '@/app/components/playlist/remove-dialog'
import { SongInfoDialog } from '@/app/components/song/info-dialog'
import {
  MainSidebarInset,
  MainSidebarProvider,
} from '@/app/components/ui/main-sidebar'
import { Header } from '@/app/layout/header'
import { MainRoutes } from './main'

const MemoHeader = memo(Header)
const MemoPlayer = memo(Player)
const MemoSongInfoDialog = memo(SongInfoDialog)
const MemoRemovePlaylistDialog = memo(RemovePlaylistDialog)
const MemoMainDrawerPage = memo(MainDrawerPage)
const MemoFullscreenMode = memo(FullscreenMode)

export default function BaseLayout() {
  return (
    <div className="h-screen w-screen overflow-hidden">
      <AppBackdrop />
      <MainSidebarProvider className="bg-transparent">
        <MemoHeader />
        <NavRail />
        <MainSidebarInset className="w-full bg-transparent pl-[--content-inset-left] pr-3">
          <MainRoutes />
        </MainSidebarInset>
        <MemoPlayer />
      </MainSidebarProvider>
      <MemoSongInfoDialog />
      <MemoRemovePlaylistDialog />
      <MemoMainDrawerPage />
      <CreatePlaylistDialog />
      <MemoFullscreenMode />
    </div>
  )
}
