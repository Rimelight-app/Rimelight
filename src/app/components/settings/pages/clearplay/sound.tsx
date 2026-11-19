import { useEffect, useState } from 'react'
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
import { audioEngine } from '@/app/hooks/use-audio-context'
import { cn } from '@/lib/utils'
import { EQ_BANDS, EQ_PRESETS, useAudioFx } from '@/store/audio-fx.store'
import { listOutputDevices, resolveOutputDevice } from '@/utils/output-device'
import { SettingSelect } from './controls'

function useOutputDevices() {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  useEffect(() => {
    const load = () =>
      listOutputDevices().then((list) => {
        setDevices(list)
        // Brings a saved id up to date if the device got a new one.
        resolveOutputDevice()
      })
    load()
    navigator.mediaDevices?.addEventListener('devicechange', load)
    return () =>
      navigator.mediaDevices?.removeEventListener('devicechange', load)
  }, [])
  return devices
}

const fmtHz = (f: number) => (f >= 1000 ? `${f / 1000}k` : `${f}`)

function Equalizer() {
  const { t } = useTranslation()
  const { eqGains, preamp, set } = useAudioFx()

  const setBand = (i: number, v: number) => {
    const next = [...eqGains]
    next[i] = v
    set({ eqGains: next, eqPreset: 'custom' })
  }

  return (
    <div className="rounded-2xl bg-white/[0.04] p-4">
      <div className="flex items-end gap-3">
        <div className="flex flex-col items-center gap-2 pr-3 border-r border-white/10">
          <span className="text-[11px] tabular-nums text-white/60">
            {preamp > 0 ? '+' : ''}
            {preamp} dB
          </span>
          <input
            type="range"
            min={-12}
            max={12}
            step={0.5}
            value={preamp}
            onChange={(e) => set({ preamp: Number(e.target.value) })}
            className="cp-vslider"
            aria-label={t('clearplay.sound.preamp')}
          />
          <span className="text-[11px] text-white/45">
            {t('clearplay.sound.preampShort')}
          </span>
        </div>
        {EQ_BANDS.map((f, i) => (
          <div key={f} className="flex flex-1 flex-col items-center gap-2">
            <span className="text-[11px] tabular-nums text-white/60">
              {eqGains[i] > 0 ? '+' : ''}
              {eqGains[i]}
            </span>
            <input
              type="range"
              min={-12}
              max={12}
              step={0.5}
              value={eqGains[i]}
              onChange={(e) => setBand(i, Number(e.target.value))}
              onDoubleClick={() => setBand(i, 0)}
              className="cp-vslider"
              aria-label={`${fmtHz(f)} Hz`}
            />
            <span className="text-[11px] text-white/45">{fmtHz(f)}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-white/40">
        {t('clearplay.sound.eqHint')}
      </p>
    </div>
  )
}

export function SoundSettings() {
  const { t } = useTranslation()
  const { eqEnabled, eqPreset, mono, speed, outputDevice, set, applyPreset } =
    useAudioFx()
  const devices = useOutputDevices()
  const [rate, setRate] = useState<number | null>(null)
  const k = 'clearplay.sound'

  useEffect(() => {
    const id = window.setInterval(
      () => setRate(audioEngine.ctx?.sampleRate ?? null),
      1000,
    )
    setRate(audioEngine.ctx?.sampleRate ?? null)
    return () => window.clearInterval(id)
  }, [])

  const presetOptions = [
    ...Object.keys(EQ_PRESETS).map((p) => ({
      value: p,
      label: t(`${k}.presets.${p}`),
    })),
    ...(eqPreset === 'custom'
      ? [{ value: 'custom', label: t(`${k}.presets.custom`) }]
      : []),
  ]

  return (
    <Root>
      <Header>
        <HeaderTitle>{t(`${k}.group`)}</HeaderTitle>
        <HeaderDescription>{t(`${k}.description`)}</HeaderDescription>
      </Header>
      <Content>
        <ContentItem>
          <ContentItemTitle info={t(`${k}.device.info`)}>
            {t(`${k}.device.label`)}
          </ContentItemTitle>
          <ContentItemForm>
            <SettingSelect
              value={
                devices.some((d) => d.deviceId === outputDevice)
                  ? outputDevice
                  : 'default'
              }
              onChange={(v) =>
                set({
                  outputDevice: v,
                  outputDeviceLabel:
                    devices.find((d) => d.deviceId === v)?.label ?? '',
                })
              }
              options={[
                { value: 'default', label: t(`${k}.device.system`) },
                ...devices
                  .filter((d) => d.deviceId && d.deviceId !== 'default')
                  .map((d, i) => ({
                    value: d.deviceId,
                    label: d.label || `${t(`${k}.device.output`)} ${i + 1}`,
                  })),
              ]}
            />
          </ContentItemForm>
        </ContentItem>

        <ContentItem>
          <ContentItemTitle>{t(`${k}.eq`)}</ContentItemTitle>
          <ContentItemForm>
            <div className="flex items-center gap-3">
              {eqEnabled && (
                <SettingSelect
                  value={eqPreset}
                  onChange={applyPreset}
                  options={presetOptions}
                />
              )}
              <Switch
                checked={eqEnabled}
                onCheckedChange={(v) => set({ eqEnabled: v })}
              />
            </div>
          </ContentItemForm>
        </ContentItem>
        {eqEnabled && <Equalizer />}

        <ContentItem>
          <ContentItemTitle info={t(`${k}.mono.info`)}>
            {t(`${k}.mono.label`)}
          </ContentItemTitle>
          <ContentItemForm>
            <Switch checked={mono} onCheckedChange={(v) => set({ mono: v })} />
          </ContentItemForm>
        </ContentItem>

        <ContentItem>
          <ContentItemTitle info={t(`${k}.speed.info`)}>
            {t(`${k}.speed.label`)}
          </ContentItemTitle>
          <ContentItemForm>
            <SettingSelect
              value={String(speed)}
              onChange={(v) => set({ speed: Number(v) })}
              options={['0.75', '0.9', '1', '1.1', '1.25', '1.5'].map((v) => ({
                value: v,
                label: `${v}×`,
              }))}
            />
          </ContentItemForm>
        </ContentItem>

        <div
          className={cn(
            'rounded-2xl bg-white/[0.04] px-4 py-3 text-[12px] text-white/55',
          )}
        >
          <p>
            <span className="text-white/80">{t(`${k}.output.label`)}: </span>
            {rate
              ? t(`${k}.output.rate`, { khz: (rate / 1000).toFixed(1) })
              : t(`${k}.output.idle`)}
          </p>
          <p className="mt-1 text-white/40">{t(`${k}.output.note`)}</p>
        </div>
      </Content>
      <ContentSeparator />
    </Root>
  )
}
