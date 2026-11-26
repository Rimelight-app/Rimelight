import { useQuery } from '@tanstack/react-query'
import { ComponentType, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'react-toastify'
import { useAppUpdate } from '@/store/app.store'
import { queryKeys } from '@/utils/queryKeys'

export type UpdateCheckResult = NonNullable<
  Awaited<ReturnType<typeof window.api.checkForUpdates>>
>

type DialogComponent = ComponentType<{
  updateCheckResult: UpdateCheckResult
  updateHasStarted: boolean
  setUpdateHasStarted: (value: boolean) => void
}>

/** The dialog's code (markdown, sanitizer): fetched only when it's needed. */
const loadDialog = () =>
  import('./update-dialog').then((m) => m.UpdateDialog as DialogComponent)

export function UpdateObserver() {
  const { t } = useTranslation()
  const { setOpenDialog, remindOnNextBoot, setRemindOnNextBoot } =
    useAppUpdate()
  const [updateHasStarted, setUpdateHasStarted] = useState(false)
  const [Dialog, setDialog] = useState<DialogComponent | null>(null)

  const { data: updateCheckResult } = useQuery({
    queryKey: [queryKeys.update.check],
    queryFn: async () => await window.api.checkForUpdates(),
    enabled: !remindOnNextBoot,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    staleTime: Infinity,
    gcTime: Infinity,
  })

  useEffect(() => {
    if (!updateCheckResult?.isUpdateAvailable) return
    let cancelled = false
    // Load the dialog first, then open it: it appears as before.
    loadDialog()
      .then((component) => {
        if (cancelled) return
        setDialog(() => component)
        setOpenDialog(true)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [setOpenDialog, updateCheckResult])

  useEffect(() => {
    window.api.onUpdateDownloaded(() => {
      toast.update('update', {
        render: t('update.toasts.success'),
        type: 'success',
        autoClose: 5000,
        isLoading: false,
      })
      window.api.quitAndInstall()
    })

    window.api.onUpdateError(() => {
      setUpdateHasStarted(false)
      setRemindOnNextBoot(true)

      toast.update('update', {
        render: t('update.toasts.error'),
        type: 'error',
        autoClose: 5000,
        isLoading: false,
      })
    })

    window.api.onDownloadProgress((progress) => {
      toast.update('update', {
        progress: progress.percent / 100,
      })
    })
  }, [t, setRemindOnNextBoot])

  if (!updateCheckResult?.isUpdateAvailable || !Dialog) return null

  return (
    <Dialog
      updateCheckResult={updateCheckResult}
      updateHasStarted={updateHasStarted}
      setUpdateHasStarted={setUpdateHasStarted}
    />
  )
}
