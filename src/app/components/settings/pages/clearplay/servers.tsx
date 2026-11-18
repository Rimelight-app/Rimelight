import { Check, Loader2, Plus, Trash2, Wifi } from 'lucide-react'
import { FormEvent, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
import { Switch } from '@/app/components/ui/switch'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/app.store'
import {
  measureServer,
  rememberCurrentServer,
  SavedServer,
  switchToServer,
  useServersStore,
  verifyServer,
} from '@/store/servers.store'

const pill =
  'glass-chip inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium text-white/80 transition-colors hover:bg-white/[0.14] hover:text-white disabled:opacity-40'

function LatencyBadge({ ms }: { ms: number | null | undefined }) {
  const { t } = useTranslation()
  if (ms === undefined) return null
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[11px] tabular-nums',
        ms === null
          ? 'bg-rose-500/15 text-rose-300'
          : 'bg-white/[0.08] text-white/75',
      )}
    >
      <span
        className={cn(
          'size-1.5 rounded-full',
          ms === null
            ? 'bg-rose-400'
            : ms < 80
              ? 'bg-emerald-400'
              : ms < 250
                ? 'bg-amber-400'
                : 'bg-orange-400',
        )}
      />
      {ms === null ? t('clearplay.servers.offline') : `${ms} ms`}
    </span>
  )
}

function ServerRow({
  server,
  active,
}: {
  server: SavedServer
  active: boolean
}) {
  const { t } = useTranslation()
  const remove = useServersStore((s) => s.remove)
  const [ms, setMs] = useState<number | null | undefined>(undefined)
  const [testing, setTesting] = useState(false)

  const test = async () => {
    setTesting(true)
    setMs(await measureServer(server))
    setTesting(false)
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: test once on open
  useEffect(() => {
    test()
  }, [])

  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors',
        active
          ? 'bg-white/[0.08] ring-1 ring-white/10'
          : 'hover:bg-white/[0.04]',
      )}
    >
      <span
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-full',
          active ? 'bg-white text-[#121216]' : 'bg-white/[0.08] text-white/60',
        )}
      >
        {active ? <Check className="size-4" /> : <Wifi className="size-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium">{server.name}</p>
        <p className="truncate text-[12px] text-white/45">
          {server.username} · {server.url}
        </p>
      </div>
      <LatencyBadge ms={ms} />
      <button type="button" onClick={test} disabled={testing} className={pill}>
        {testing ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          t('clearplay.servers.test')
        )}
      </button>
      {active ? (
        <span className="inline-flex h-8 items-center rounded-full bg-white px-3 text-[12px] font-semibold text-[#121216]">
          {t('clearplay.servers.active')}
        </span>
      ) : (
        <>
          <button
            type="button"
            onClick={() => switchToServer(server)}
            className={pill}
          >
            {t('clearplay.servers.use')}
          </button>
          <button
            type="button"
            onClick={() => remove(server.id)}
            className="flex size-8 items-center justify-center rounded-full text-white/45 transition-colors hover:bg-rose-500/15 hover:text-rose-300"
            aria-label={t('clearplay.servers.remove')}
          >
            <Trash2 className="size-4" />
          </button>
        </>
      )}
    </li>
  )
}

function AddServer({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation()
  const upsert = useServersStore((s) => s.upsert)
  const [form, setForm] = useState({
    name: '',
    url: '',
    username: '',
    password: '',
  })
  const [state, setState] = useState<'idle' | 'checking' | 'failed'>('idle')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setState('checking')
    const server = await verifyServer(
      form.url,
      form.username,
      form.password,
      form.name,
    )
    if (!server) {
      setState('failed')
      return
    }
    upsert(server)
    onDone()
  }

  const input =
    'h-9 rounded-full border border-white/10 bg-white/[0.05] px-4 text-[13px] outline-none placeholder:text-white/35 focus:border-white/30'

  return (
    <form
      onSubmit={submit}
      className="grid gap-2 rounded-2xl bg-white/[0.04] p-3 sm:grid-cols-2"
    >
      <input
        className={input}
        placeholder={t('clearplay.servers.name')}
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
      />
      <input
        className={input}
        placeholder="http://100.x.y.z:4533"
        required
        value={form.url}
        onChange={(e) => setForm({ ...form, url: e.target.value })}
      />
      <input
        className={input}
        placeholder={t('login.form.username')}
        required
        autoComplete="username"
        value={form.username}
        onChange={(e) => setForm({ ...form, username: e.target.value })}
      />
      <input
        className={input}
        placeholder={t('login.form.password')}
        required
        type="password"
        autoComplete="current-password"
        value={form.password}
        onChange={(e) => setForm({ ...form, password: e.target.value })}
      />
      <div className="flex items-center gap-2 sm:col-span-2">
        <button
          type="submit"
          disabled={state === 'checking'}
          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white/90 px-4 text-[12px] font-semibold text-[#121216] hover:bg-white disabled:opacity-60"
        >
          {state === 'checking' && (
            <Loader2 className="size-3.5 animate-spin" />
          )}
          {t('clearplay.servers.save')}
        </button>
        <button type="button" onClick={onDone} className={pill}>
          {t('clearplay.servers.cancel')}
        </button>
        {state === 'failed' && (
          <span className="text-[12px] text-rose-300">
            {t('clearplay.servers.failed')}
          </span>
        )}
      </div>
    </form>
  )
}

export function ServersSettings() {
  const { t } = useTranslation()
  const { servers, autoSelectFastest, setAutoSelectFastest } = useServersStore()
  const { url, username } = useAppStore((s) => s.data)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    rememberCurrentServer()
  }, [])

  return (
    <div className="space-y-4">
      <Root>
        <Header>
          <HeaderTitle>{t('clearplay.servers.group')}</HeaderTitle>
          <HeaderDescription>
            {t('clearplay.servers.description')}
          </HeaderDescription>
        </Header>
        <Content>
          <ul className="space-y-1.5">
            {servers.map((s) => (
              <ServerRow
                key={s.id}
                server={s}
                active={s.url === url && s.username === username}
              />
            ))}
          </ul>
          {adding ? (
            <AddServer onDone={() => setAdding(false)} />
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className={pill}
            >
              <Plus className="size-3.5" />
              {t('clearplay.servers.add')}
            </button>
          )}
          <ContentItem>
            <ContentItemTitle info={t('clearplay.servers.fastest.info')}>
              {t('clearplay.servers.fastest.label')}
            </ContentItemTitle>
            <ContentItemForm>
              <Switch
                checked={autoSelectFastest}
                onCheckedChange={setAutoSelectFastest}
              />
            </ContentItemForm>
          </ContentItem>
        </Content>
        <ContentSeparator />
      </Root>
    </div>
  )
}
