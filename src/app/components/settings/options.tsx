import {
  EarthLock,
  FileText,
  Globe,
  Headphones,
  LaptopIcon,
  Paintbrush,
  Server,
} from 'lucide-react'
import { ComponentType } from 'react'
import { useTranslation } from 'react-i18next'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/app/components/ui/sidebar'
import { useAppSettings } from '@/store/app.store'
import { isDesktop } from '@/utils/desktop'

export type SettingsOptions =
  | 'servers'
  | 'appearance'
  | 'language'
  | 'audio'
  | 'content'
  | 'accounts'
  | 'desktop'
  | 'privacy'

interface OptionsData {
  id: SettingsOptions
  icon: ComponentType
}

const desktopOption: OptionsData = { id: 'desktop', icon: LaptopIcon }

const options: OptionsData[] = [
  { id: 'servers', icon: Server },
  { id: 'appearance', icon: Paintbrush },
  { id: 'language', icon: Globe },
  { id: 'audio', icon: Headphones },
  { id: 'content', icon: FileText },
  ...(isDesktop() ? [desktopOption] : []),
  { id: 'privacy', icon: EarthLock },
]

export function SettingsOptions() {
  const { t } = useTranslation()
  const { currentPage, setCurrentPage } = useAppSettings()

  return (
    <SidebarGroup className="p-3">
      <SidebarGroupContent>
        <SidebarMenu className="gap-1">
          {options.map((item) => (
            <SidebarMenuItem key={item.id}>
              <SidebarMenuButton
                isActive={item.id === currentPage}
                onClick={() => setCurrentPage(item.id)}
                className="h-9 rounded-xl px-3 text-muted-foreground transition-colors hover:text-foreground data-[active=true]:font-medium data-[active=true]:text-foreground"
              >
                <item.icon />
                <span>{t(`settings.options.${item.id}`)}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
