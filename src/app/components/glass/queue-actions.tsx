import { CloudDownload, CloudUpload, ListPlus, ListX } from 'lucide-react'
import { FormEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'react-toastify'
import { SimpleTooltip } from '@/app/components/ui/simple-tooltip'
import { queueSync } from '@/service/queue-sync'
import { usePlayerActions } from '@/store/player.store'

const btn =
  'flex size-8 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40'

/**
 * Queue tools: save/load the queue on the server, save it as a playlist, and
 * clear it (the playing song stays).
 */
export function QueueActions() {
  const { t } = useTranslation()
  const { clearQueue } = usePlayerActions()
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const run = async (fn: () => Promise<boolean>, ok: string, fail: string) => {
    setBusy(true)
    const done = await fn().catch(() => false)
    setBusy(false)
    if (done) toast.success(ok)
    else toast.error(fail)
  }

  const savePlaylist = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    await run(
      () => queueSync.saveAsPlaylist(name.trim()),
      t('rimelight.queue.playlistSaved', { name: name.trim() }),
      t('rimelight.queue.failed'),
    )
    setNaming(false)
    setName('')
  }

  if (naming) {
    return (
      <form
        onSubmit={savePlaylist}
        className="flex items-center gap-1.5 px-2 pb-2"
      >
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('rimelight.queue.playlistName')}
          className="h-8 min-w-0 flex-1 rounded-full border border-white/10 bg-white/[0.05] px-3 text-[12px] outline-none placeholder:text-white/35 focus:border-white/30"
        />
        <button
          type="submit"
          disabled={busy}
          className="h-8 rounded-full bg-white/90 px-3 text-[12px] font-semibold text-[#121216]"
        >
          {t('rimelight.servers.save')}
        </button>
        <button
          type="button"
          onClick={() => setNaming(false)}
          className="h-8 rounded-full px-2 text-[12px] text-white/60 hover:text-white"
        >
          {t('rimelight.servers.cancel')}
        </button>
      </form>
    )
  }

  return (
    <div className="flex items-center justify-end gap-0.5 px-2 pb-1">
      <SimpleTooltip text={t('rimelight.queue.save')}>
        <button
          type="button"
          disabled={busy}
          className={btn}
          onClick={() =>
            run(
              queueSync.saveToServer,
              t('rimelight.queue.saved'),
              t('rimelight.queue.failed'),
            )
          }
        >
          <CloudUpload className="size-4" />
        </button>
      </SimpleTooltip>
      <SimpleTooltip text={t('rimelight.queue.load')}>
        <button
          type="button"
          disabled={busy}
          className={btn}
          onClick={() =>
            run(
              queueSync.restoreFromServer,
              t('rimelight.queue.loaded'),
              t('rimelight.queue.nothing'),
            )
          }
        >
          <CloudDownload className="size-4" />
        </button>
      </SimpleTooltip>
      <SimpleTooltip text={t('rimelight.queue.asPlaylist')}>
        <button
          type="button"
          disabled={busy}
          className={btn}
          onClick={() => setNaming(true)}
        >
          <ListPlus className="size-4" />
        </button>
      </SimpleTooltip>
      <SimpleTooltip text={t('rimelight.queue.clear')}>
        <button
          type="button"
          className={btn}
          onClick={clearQueue}
          data-testid="queue-clear"
        >
          <ListX className="size-4" />
        </button>
      </SimpleTooltip>
    </div>
  )
}
