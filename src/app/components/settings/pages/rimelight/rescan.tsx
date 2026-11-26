import { RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'react-toastify'
import {
  Content,
  ContentItem,
  ContentItemForm,
  ContentItemTitle,
  ContentSeparator,
  Header,
  HeaderDescription,
  HeaderTitle,
  Root,
} from '@/app/components/settings/section'
import { cn } from '@/lib/utils'
import { rescanLibrary } from '@/service/rescan'

const pill =
  'glass-chip inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium text-white/80 transition-colors hover:bg-white/[0.14] hover:text-white disabled:opacity-40'

/** Settings → Servers: scan the current library for new songs and lyrics. */
export function RescanLibrarySettings() {
  const { t } = useTranslation()
  const [scanning, setScanning] = useState(false)
  const k = 'rimelight.rescan'

  async function rescan() {
    setScanning(true)
    const result = await rescanLibrary()
    setScanning(false)

    if (!result.ok) {
      toast.error(t(`${k}.failed`))
      return
    }
    const added =
      result.before !== null && result.after !== null
        ? result.after - result.before
        : null
    toast.success(
      added && added > 0 ? t(`${k}.doneNew`, { count: added }) : t(`${k}.done`),
    )
  }

  return (
    <Root>
      <Header>
        <HeaderTitle>{t(`${k}.group`)}</HeaderTitle>
        <HeaderDescription>{t(`${k}.description`)}</HeaderDescription>
      </Header>
      <Content>
        <ContentItem>
          <ContentItemTitle info={t(`${k}.info`)}>
            {t(`${k}.label`)}
          </ContentItemTitle>
          <ContentItemForm>
            <button
              type="button"
              className={pill}
              disabled={scanning}
              onClick={rescan}
              data-testid="rescan-library"
            >
              <RefreshCw
                className={cn('size-3.5', scanning && 'animate-spin')}
                strokeWidth={1.75}
              />
              {scanning ? t(`${k}.scanning`) : t(`${k}.button`)}
            </button>
          </ContentItemForm>
        </ContentItem>
      </Content>
      <ContentSeparator />
    </Root>
  )
}
