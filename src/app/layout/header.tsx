import { LibraryTabs } from '@/app/components/glass/library-tabs'
import { RimelightLogo } from '@/app/components/glass/logo'
import { NavigationButtons } from '@/app/components/header/navigation-buttons'
import { UserDropdown } from '@/app/components/header/user-dropdown'
import { useAppWindow } from '@/app/hooks/use-app-window'
import { isLinux, isMacOS, isWindows } from '@/utils/desktop'

export function Header() {
  const { isFullscreen } = useAppWindow()

  return (
    <header className="w-full grid grid-cols-[1fr_auto_1fr] items-center h-header pr-3 fixed top-0 right-0 left-0 z-20 bg-transparent electron-drag">
      <div className="flex items-center">
        {isMacOS && !isFullscreen && <div className="w-[70px]" />}
        <div className="w-[calc(var(--rail-width)+12px)] pl-3 mr-3 flex justify-center">
          <RimelightLogo className="size-[26px] drop-shadow-[0_2px_6px_rgb(0_0_0/0.35)]" />
        </div>
        <NavigationButtons />
      </div>
      <LibraryTabs />
      <div className="flex justify-end items-center gap-2">
        <UserDropdown />
        {isWindows && !isFullscreen && <div className="w-[122px]" />}
        {isLinux && !isFullscreen && <div className="w-[94px]" />}
      </div>
    </header>
  )
}
