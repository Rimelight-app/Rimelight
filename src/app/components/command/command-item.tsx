import clsx from 'clsx'
import {
  Cog,
  ListMusic,
  Palette,
  PlusIcon,
  SquareArrowOutUpRight,
} from 'lucide-react'
import { ReactNode } from 'react'

type Variant =
  | 'GotoPage'
  | 'ChangeTheme'
  | 'Playlists'
  | 'CreatePlaylist'
  | 'ServerManagement'

type CommandItemProps = {
  children: ReactNode
  variant: Variant
}

const icons = {
  GotoPage: {
    className: '',
    icon: <SquareArrowOutUpRight />,
  },
  ChangeTheme: {
    className: '',
    icon: <Palette />,
  },
  Playlists: {
    className: '',
    icon: <ListMusic />,
  },
  CreatePlaylist: {
    className: '',
    icon: <PlusIcon />,
  },
  ServerManagement: {
    className: '',
    icon: <Cog />,
  },
}

export function CustomCommandItem({ children, variant }: CommandItemProps) {
  const { className, icon } = icons[variant as keyof typeof icons]

  return (
    <div className="flex gap-3 items-center">
      <div
        className={clsx(
          'flex size-7 items-center justify-center rounded-[9px] bg-white/[0.08] text-white/80 ring-1 ring-white/10 [&_svg]:size-4',
          className,
        )}
      >
        {icon}
      </div>
      {children}
    </div>
  )
}
