import clsx from 'clsx'
import {
  Ellipsis,
  Heart,
  Info,
  ListPlus,
  Pause,
  Play,
  Search,
  Shuffle,
} from 'lucide-react'
import { ButtonHTMLAttributes, ComponentPropsWithoutRef } from 'react'
import { Button as ComponentButton } from '@/app/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/app/components/ui/dropdown-menu'
import { SimpleTooltip } from '@/app/components/ui/simple-tooltip'
import { cn } from '@/lib/utils'

type ActionsContainerProps = ComponentPropsWithoutRef<'div'>

function Container({ children, className, ...rest }: ActionsContainerProps) {
  return (
    <div
      {...rest}
      className={cn('w-full mb-5 flex items-center gap-2', className)}
    >
      {children}
    </div>
  )
}

interface ActionsMainButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  tooltip?: string
  buttonStyle?: 'primary' | 'secondary'
  isActive?: boolean
  /** Text shown next to the icon (primary pill only). */
  label?: string
}

function Button({
  children,
  tooltip,
  buttonStyle = 'secondary',
  className,
  isActive = false,
  label,
  ...props
}: ActionsMainButtonProps) {
  const isPrimary = buttonStyle === 'primary'
  const button = (
    <ComponentButton
      className={cn(
        'relative rounded-full transition-[background-color,color,transform] duration-200 ease-out active:scale-95',
        isPrimary
          ? 'h-10 gap-2 px-5 mr-1 bg-white/90 text-[#121216] hover:bg-white text-sm font-semibold shadow-[0_10px_28px_-12px_rgb(255_255_255/0.45)]'
          : 'glass-chip size-10 p-0 text-white/80 hover:text-white hover:bg-white/[0.14]',
        className,
        isActive && 'text-white bg-white/[0.2] action-button-active',
      )}
      variant={isPrimary ? 'default' : 'ghost'}
      {...props}
    >
      {children}
      {isPrimary && label && <span>{label}</span>}
    </ComponentButton>
  )

  if (!tooltip) return button

  return <SimpleTooltip text={tooltip}>{button}</SimpleTooltip>
}

interface DropdownProps {
  tooltip: string
  options?: React.ReactNode
}

function Dropdown({ tooltip, options }: DropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        asChild
        className="outline-none focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:ring-transparent focus:ring-transparent"
      >
        <ComponentButton
          className={clsx(
            'glass-chip size-10 rounded-full p-0 text-white/80',
            'data-[state=open]:bg-white/[0.18] hover:bg-white/[0.14] hover:text-white',
            'transition-colors duration-200',
          )}
          variant="ghost"
        >
          <SimpleTooltip text={tooltip}>
            <div className="size-10 rounded-full flex justify-center items-center">
              <EllipsisIcon />
            </div>
          </SimpleTooltip>
        </ComponentButton>
      </DropdownMenuTrigger>
      {options && (
        <DropdownMenuContent className="min-w-56" align="start">
          {options}
        </DropdownMenuContent>
      )}
    </DropdownMenu>
  )
}

function PlayIcon() {
  return <Play className="size-4 fill-current" strokeWidth={2.5} />
}

function PauseIcon() {
  return <Pause className="size-4 fill-current" strokeWidth={2.5} />
}

function ShuffleIcon() {
  return <Shuffle className="size-[18px]" strokeWidth={1.75} />
}

function QueueIcon() {
  return <ListPlus className="size-[18px]" strokeWidth={1.75} />
}

function SearchIcon() {
  return <Search className="size-[18px]" strokeWidth={1.75} />
}

interface LikeIconProps {
  isStarred?: boolean
}

function LikeIcon({ isStarred }: LikeIconProps) {
  return (
    <Heart
      className={clsx(
        'size-[18px]',
        isStarred && 'text-rose-400 fill-rose-400',
      )}
      strokeWidth={1.75}
    />
  )
}

function InfoIcon() {
  return <Info className="size-[18px]" strokeWidth={1.75} />
}

function EllipsisIcon() {
  return <Ellipsis className="size-[18px]" strokeWidth={1.75} />
}

export const Actions = {
  Container,
  Button,
  PlayIcon,
  PauseIcon,
  ShuffleIcon,
  QueueIcon,
  SearchIcon,
  LikeIcon,
  InfoIcon,
  EllipsisIcon,
  Dropdown,
}
