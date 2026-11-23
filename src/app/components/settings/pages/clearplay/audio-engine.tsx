import { Check, Copy, RotateCw } from 'lucide-react'
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
import { useOutputLine } from '@/app/hooks/use-output-line'
import { cn } from '@/lib/utils'
import {
  recheckDevice,
  reloadCurrent,
  syncSliderToDevice,
} from '@/service/mpv-player'
import {
  OutputInfoPlacement,
  useBitPerfect,
  useMpvRuntime,
} from '@/store/bitperfect.store'
import { usePlayerStore } from '@/store/player.store'
import {
  effectiveVolumeMode,
  formatKhz,
  formatRates,
  VolumeMode,
} from '@/utils/bitperfect'
import type {
  AudioEngine,
  MpvDevice,
} from '../../../../../../electron/preload/types'
import { SettingSelect } from './controls'

/** Settings → Player & Audio: engine choice, output details, where to show them. */
export function AudioEngineSettings() {
  const { t } = useTranslation()
  const k = 'clearplay.bitperfect'
  const status = useMpvRuntime((s) => s.status)
  const setRuntime = useMpvRuntime((s) => s.set)
  const placement = useBitPerfect((s) => s.placement)
  const setBp = useBitPerfect((s) => s.set)
  const [saving, setSaving] = useState(false)

  if (!status) return null

  const mpvSession = status.sessionEngine === 'mpv'
  const pending = status.savedEngine !== status.sessionEngine
  const engineName = (e: AudioEngine) =>
    e === 'mpv' ? t(`${k}.engine.mpv`) : t(`${k}.engine.builtin`)

  async function choose(engine: AudioEngine) {
    setSaving(true)
    try {
      const next = await window.api.mpv.setEngine(engine)
      setRuntime({ status: next })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Root>
      <Header>
        <HeaderTitle>{t(`${k}.group`)}</HeaderTitle>
        <HeaderDescription>{t(`${k}.description`)}</HeaderDescription>
      </Header>
      <Content>
        <ContentItem>
          <ContentItemTitle info={t(`${k}.engine.info`)}>
            {t(`${k}.engine.label`)}
          </ContentItemTitle>
          <ContentItemForm>
            <SettingSelect
              value={status.savedEngine}
              onChange={(v) => !saving && choose(v)}
              options={[
                { value: 'builtin', label: engineName('builtin') },
                { value: 'mpv', label: engineName('mpv') },
              ]}
            />
          </ContentItemForm>
        </ContentItem>

        {status.savedEngine === 'mpv' && !status.available && (
          <Note tone="warn" testId="mpv-missing">
            {t(`${k}.engine.missing`, { problem: status.problem })}
          </Note>
        )}

        {pending && (status.savedEngine === 'builtin' || status.available) && (
          <Note testId="engine-restart">
            <span className="flex-1">
              {t(`${k}.engine.restart`, {
                engine: engineName(status.savedEngine),
              })}
            </span>
            <button
              type="button"
              onClick={() => window.api.mpv.relaunch()}
              className="shrink-0 rounded-full bg-white/[0.14] px-3 py-1 text-[12px] font-medium text-white transition-colors hover:bg-white/[0.22]"
            >
              {t(`${k}.engine.restartNow`)}
            </button>
          </Note>
        )}

        {mpvSession ? (
          <>
            <OutputInfo />
            <ContentItem>
              <ContentItemTitle>{t(`${k}.placement.label`)}</ContentItemTitle>
              <ContentItemForm className="w-auto max-w-[280px]">
                <SettingSelect<OutputInfoPlacement>
                  value={placement}
                  onChange={(v) => setBp({ placement: v })}
                  options={[
                    { value: 'settings', label: t(`${k}.placement.settings`) },
                    { value: 'player', label: t(`${k}.placement.player`) },
                  ]}
                />
              </ContentItemForm>
            </ContentItem>
          </>
        ) : (
          <p className="px-1 text-[12px] text-white/60">
            {t(`${k}.info.builtinNote`)}
          </p>
        )}
      </Content>
      <ContentSeparator />
    </Root>
  )
}

function Note({
  children,
  tone = 'info',
  testId,
}: {
  children: React.ReactNode
  tone?: 'info' | 'warn'
  testId?: string
}) {
  return (
    <div
      data-testid={testId}
      className={cn(
        'flex items-center gap-3 rounded-2xl px-4 py-2.5 text-[12px]',
        tone === 'warn'
          ? 'bg-amber-400/[0.10] text-amber-100/90'
          : 'bg-white/[0.06] text-white/75',
      )}
    >
      {children}
    </div>
  )
}

export function currentDevice(
  list: MpvDevice[],
  key: string,
): MpvDevice | undefined {
  return list.find((d) => d.key === key) ?? list.find((d) => d.key === 'system')
}

/** Device, what it supports, volume, access and the song's path, like Android's USB DAC details. */
function OutputInfo() {
  const { t } = useTranslation()
  const k = 'clearplay.bitperfect.info'
  const status = useMpvRuntime((s) => s.status)
  const output = useMpvRuntime((s) => s.output)
  const list = useMpvRuntime((s) => s.deviceList)
  const checking = useMpvRuntime((s) => s.checking)
  const deviceKey = useBitPerfect((s) => s.device)
  const prefs = useBitPerfect((s) => s.devices)
  const song = usePlayerStore((s) =>
    s.playerState.mediaType === 'song' ? s.songlist.currentSong : null,
  )
  const line = useOutputLine()
  const [copied, setCopied] = useState(false)

  // While something plays, describe the device it plays on.
  const key =
    output?.deviceKey ?? currentDevice(list, deviceKey)?.key ?? 'system'
  const device = list.find((d) => d.key === key)
  const caps = prefs[key]?.caps
  const exclusiveDevice = device?.kind === 'exclusive'

  const supports = !exclusiveDevice
    ? '—'
    : checking === key
      ? t(`${k}.checking`)
      : caps && caps.rates.length
        ? `${formatRates(caps.rates)}${caps.depths.length ? ` · ${caps.depths.join(', ')}-bit` : ''}`
        : t(`${k}.supportsUnknown`)
  const supportsSource =
    exclusiveDevice && caps?.rates.length
      ? caps.source === 'kernel'
        ? t(`${k}.fromKernel`)
        : t(`${k}.fromProbe`)
      : ''

  const hw =
    (output?.deviceKey === key ? output.hwVolume : null) ??
    caps?.hwVolume ??
    null
  const hwText = !exclusiveDevice
    ? t(`${k}.hwNo`)
    : hw === null
      ? t(`${k}.hwUnknown`)
      : hw
        ? `${t(`${k}.hwYes`)}${caps?.volumeControl ? ` (${caps.volumeControl})` : ''}${
            output?.hwDb !== null &&
            output?.hwDb !== undefined &&
            output.deviceKey === key
              ? ` · ${output.hwDb.toFixed(1)} dB`
              : ''
          }`
        : t(`${k}.hwNo`)

  const access = output
    ? output.exclusive
      ? t(`${k}.exclusive`)
      : t(`${k}.shared`)
    : exclusiveDevice
      ? t(`${k}.exclusive`)
      : t(`${k}.shared`)

  const songPath =
    output?.source && output.output
      ? `${(song?.suffix ?? '').toUpperCase()} ${formatKhz(output.source.rate)}${
          song?.bitDepth ? ` ${song.bitDepth}-bit` : ''
        } → ${formatKhz(output.output.rate)} ${output.output.format.toUpperCase()}`
      : ''

  const rows: [string, string][] = [
    [
      t(`${k}.device`),
      `${device?.name ?? output?.deviceName ?? '—'}${device?.detail ? ` (${device.detail})` : ''}`,
    ],
    [
      t(`${k}.supports`),
      `${supports}${supportsSource ? ` · ${supportsSource}` : ''}`,
    ],
    [t(`${k}.hwVolume`), hwText],
    [t(`${k}.access`), access],
    [t(`${k}.now`), line.text],
    ...(songPath ? ([[t(`${k}.song`), songPath]] as [string, string][]) : []),
  ]

  async function copy() {
    const text = [
      'ClearPlay output (mpv engine)',
      ...rows.map(([a, b]) => `${a}: ${b}`),
      `mpv ${status?.version ?? '?'} · ${status?.platform ?? ''}`,
    ].join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success(t(`${k}.copied`))
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard unavailable
    }
  }

  return (
    <div
      className="rounded-2xl bg-white/[0.04] px-4 py-3 text-[12px]"
      data-testid="output-info"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[13px] font-medium text-white/85">
          {t(`${k}.title`)}
        </span>
        <button
          type="button"
          onClick={copy}
          data-testid="output-info-copy"
          className="flex items-center gap-1.5 rounded-full bg-white/[0.08] px-2.5 py-1 text-[11px] text-white/75 transition-colors hover:bg-white/[0.16] hover:text-white"
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {t(`${k}.copy`)}
        </button>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-white/60">{label}</dt>
            <dd
              className={cn(
                'min-w-0 text-white/80',
                label === t(`${k}.now`) &&
                  (line.bitPerfect ? 'text-white' : 'text-white/80'),
              )}
              data-testid={
                label === t(`${k}.now`) ? 'output-info-now' : undefined
              }
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/** Rate toggles and volume mode for the selected device (mpv engine). */
export function MpvDeviceOptions({ deviceKey }: { deviceKey: string }) {
  const { t } = useTranslation()
  const k = 'clearplay.bitperfect.device'
  const list = useMpvRuntime((s) => s.deviceList)
  const checking = useMpvRuntime((s) => s.checking)
  const prefs = useBitPerfect((s) => s.devices[deviceKey])
  const setDevice = useBitPerfect((s) => s.setDevice)
  const device = list.find((d) => d.key === deviceKey)
  const [recheck, setRecheck] = useState(false)

  if (!device) return null
  if (device.kind === 'bluetooth') return <Hint>{t(`${k}.bluetooth`)}</Hint>
  if (device.kind === 'shared') return <Hint>{t(`${k}.system`)}</Hint>

  const caps = prefs?.caps
  const disabled = prefs?.disabledRates ?? []
  const learned = prefs?.learnedUnsupported ?? []
  const hw = caps?.hwVolume
  const mode = effectiveVolumeMode(prefs, device.kind)

  const toggleRate = (rate: number) => {
    const next = disabled.includes(rate)
      ? disabled.filter((r) => r !== rate)
      : [...disabled, rate]
    // Keep at least one rate.
    if ((caps?.rates ?? []).every((r) => next.includes(r))) return
    setDevice(deviceKey, { disabledRates: next })
    reloadCurrent()
  }

  const setMode = (m: VolumeMode) => {
    setDevice(deviceKey, { volumeMode: m })
    syncSliderToDevice()
    reloadCurrent()
  }

  const volumeOptions = [
    ...(hw !== false
      ? [
          {
            value: 'hardware' as const,
            label: caps?.volumeControl
              ? t(`${k}.hardware`, { control: caps.volumeControl })
              : t(`${k}.hardwarePlain`),
          },
        ]
      : []),
    { value: 'fixed' as const, label: t(`${k}.fixed`) },
    { value: 'app' as const, label: t(`${k}.app`) },
  ]

  return (
    <div className="space-y-2" data-testid="mpv-device-options">
      <ContentItem>
        <ContentItemTitle info={t(`${k}.ratesInfo`)}>
          {t(`${k}.rates`)}
        </ContentItemTitle>
        <ContentItemForm className="w-auto max-w-none">
          <div className="flex items-center justify-end gap-1.5">
            {(caps?.rates ?? []).map((r) => {
              const off = disabled.includes(r)
              const bad = learned.includes(r)
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => toggleRate(r)}
                  aria-pressed={!off}
                  data-testid={`rate-${r}`}
                  title={bad ? 'Played converted last time' : undefined}
                  className={cn(
                    'rounded-full px-2.5 py-1 text-[11px] tabular-nums transition-colors',
                    off
                      ? 'bg-white/[0.04] text-white/35 line-through'
                      : 'bg-white/[0.14] text-white/90 hover:bg-white/[0.2]',
                    bad && !off && 'ring-1 ring-amber-300/40',
                  )}
                >
                  {formatKhz(r).replace(' kHz', '')}
                </button>
              )
            })}
            <button
              type="button"
              disabled={checking === deviceKey || recheck}
              onClick={async () => {
                setRecheck(true)
                await recheckDevice(deviceKey)
                setRecheck(false)
              }}
              className="ml-1 flex items-center gap-1 rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] text-white/70 hover:bg-white/[0.14] hover:text-white disabled:opacity-50"
              data-testid="device-recheck"
            >
              <RotateCw
                className={cn(
                  'size-3',
                  (checking === deviceKey || recheck) && 'animate-spin',
                )}
              />
              {t(`${k}.check`)}
            </button>
          </div>
        </ContentItemForm>
      </ContentItem>

      <ContentItem>
        <ContentItemTitle info={t(`${k}.volumeInfo`)}>
          {t(`${k}.volume`)}
        </ContentItemTitle>
        <ContentItemForm className="w-auto max-w-[280px]">
          <SettingSelect<VolumeMode>
            value={mode}
            onChange={(v) => setMode(v)}
            options={volumeOptions}
          />
        </ContentItemForm>
      </ContentItem>
      {hw === false && !prefs?.volumeMode && (
        <Hint>{t(`${k}.chooseVolume`)}</Hint>
      )}
      {!prefs?.started && <Hint>{t(`${k}.quiet`)}</Hint>}
    </div>
  )
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="px-1 text-[12px] text-white/60">{children}</p>
}
