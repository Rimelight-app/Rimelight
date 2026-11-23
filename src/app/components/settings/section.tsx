import { InfoIcon } from 'lucide-react'
import { ComponentPropsWithoutRef, ReactNode } from 'react'
import { SimpleTooltip } from '@/app/components/ui/simple-tooltip'
import { cn } from '@/lib/utils'

type SectionComponent = ComponentPropsWithoutRef<'div'>

export function Root({ children, className, ...props }: SectionComponent) {
  return (
    <div className={cn('w-full', className)} {...props}>
      {children}
    </div>
  )
}

export function Header({ children, className, ...props }: SectionComponent) {
  return (
    <div className={cn('w-full mb-2 px-1 space-y-1', className)} {...props}>
      {children}
    </div>
  )
}

export function HeaderTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold uppercase leading-none tracking-[0.14em] text-muted-foreground">
      {children}
    </h3>
  )
}

export function HeaderDescription({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs leading-snug text-muted-foreground">{children}</p>
  )
}

/** A frosted card holding a group's settings, one row each. */
export function Content({ children, className, ...props }: SectionComponent) {
  return (
    <div
      className={cn(
        'glass-panel rounded-[20px] px-4 py-1 [&>:not(.cp-setting-row)]:my-3',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function ContentItem({
  children,
  className,
  ...props
}: SectionComponent) {
  return (
    <div
      className={cn(
        'cp-setting-row flex items-center gap-4 min-h-[52px] py-2.5 border-t border-border first:border-t-0',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

interface ContentItemTitleProps extends ComponentPropsWithoutRef<'span'> {
  info?: string
}

export function ContentItemTitle({
  info,
  className,
  children,
}: ContentItemTitleProps) {
  return (
    <div className="flex flex-1 items-center gap-1">
      <span className={cn('text-sm leading-snug text-foreground', className)}>
        {children}
      </span>
      {info && (
        <SimpleTooltip text={info} delay={0}>
          <div className="hover:bg-muted-foreground/20 p-1 rounded-full cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
            <InfoIcon className="w-3 h-3" />
          </div>
        </SimpleTooltip>
      )}
    </div>
  )
}

export function ContentItemForm({
  children,
  className,
  ...props
}: SectionComponent) {
  return (
    <div
      className={cn('w-2/5 max-w-52 flex items-center justify-end', className)}
      {...props}
    >
      {children}
    </div>
  )
}

/**
 * Groups are separate cards and rows have their own dividers, so this draws
 * nothing now (some groups also use it inside a card).
 */
export function ContentSeparator(_props: { className?: string }) {
  return null
}
