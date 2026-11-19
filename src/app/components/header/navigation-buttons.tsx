import clsx from 'clsx'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/app/components/ui/button'
import useNavigationHistory from '@/app/hooks/use-navigation-history'

/**
 * Back/forward through pages. They used to be disabled whenever the lyrics or
 * queue side panel was open, which in ClearPlay is most of the time.
 */
export function NavigationButtons() {
  const { canGoBack, canGoForward, goBack, goForward } = useNavigationHistory()

  return (
    <div className="flex gap-1">
      <div className={clsx('size-8', !canGoBack && 'cursor-not-allowed')}>
        <Button
          variant="ghost"
          size="sm"
          className="size-8 p-0 rounded-md"
          disabled={!canGoBack}
          onClick={goBack}
        >
          <ChevronLeft className="size-5" />
        </Button>
      </div>
      <div className={clsx('size-8', !canGoForward && 'cursor-not-allowed')}>
        <Button
          variant="ghost"
          size="sm"
          className="size-8 p-0 rounded-md"
          disabled={!canGoForward}
          onClick={goForward}
        >
          <ChevronRight className="size-5" />
        </Button>
      </div>
    </div>
  )
}
