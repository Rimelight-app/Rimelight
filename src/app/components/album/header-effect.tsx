import { ComponentPropsWithoutRef, forwardRef } from 'react'
import { cn } from '@/lib/utils'

export const ImageHeaderEffect = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<'div'>
>(({ children, className, ...props }, ref) => {
  // Rimelight: the window backdrop replaces this colour wash.
  return (
    <div ref={ref} className={cn('hidden', className)} {...props}>
      {children}
    </div>
  )
})
ImageHeaderEffect.displayName = 'ImageHeaderEffect'
