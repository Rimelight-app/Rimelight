import clsx from 'clsx'
import {
  ComponentPropsWithoutRef,
  RefObject,
  useEffect,
  useRef,
  WheelEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import { VolumeIcon } from '@/app/components/icons/volume-icon'
import { Button } from '@/app/components/ui/button'
import { SimpleTooltip } from '@/app/components/ui/simple-tooltip'
import { Slider } from '@/app/components/ui/slider'
import { usePlayerHotkeys } from '@/app/hooks/use-audio-hotkeys'
import { cn } from '@/lib/utils'
import { useVolumeFixed } from '@/store/bitperfect.store'
import { usePlayerVolume, useVolumeSettings } from '@/store/player.store'
import { PopoverVolume } from './popover-volume'

interface PlayerVolumeProps {
  disabled: boolean
  audioRef: RefObject<HTMLAudioElement>
}

export function PlayerVolume({
  disabled: noMedia,
  audioRef,
}: PlayerVolumeProps) {
  const { t } = useTranslation()
  const { volume, handleVolumeWheel } = usePlayerVolume()
  const { useAudioHotkeys } = usePlayerHotkeys()
  const fixed = useVolumeFixed()
  const disabled = noMedia || fixed

  useAudioHotkeys('mod+up', () => !fixed && handleVolumeWheel(false))
  useAudioHotkeys('mod+down', () => !fixed && handleVolumeWheel(true))

  useEffect(() => {
    if (!audioRef.current) return

    audioRef.current.volume = volume / 100
  }, [audioRef, volume])

  const tooltipText = fixed
    ? t('clearplay.bitperfect.fixedVolume')
    : volume === 0
      ? t('player.tooltips.volume.unmute')
      : t('player.tooltips.volume.mute')

  return (
    <div className={clsx(disabled && 'opacity-50')}>
      <div className="flex 2xl:hidden">
        <PopoverVolume>
          <VolumeIcon volume={volume} size={18} />
        </PopoverVolume>
      </div>

      <div className="hidden 2xl:flex gap-2 pr-2 items-center">
        <SimpleTooltip text={tooltipText} disabled={noMedia}>
          <div className="h-10 flex items-center">
            <MuteButton disabled={disabled}>
              <div className="text-secondary-foreground">
                <VolumeIcon volume={volume} size={18} />
              </div>
            </MuteButton>
          </div>
        </SimpleTooltip>
        <VolumeSlider disabled={disabled} />
      </div>
    </div>
  )
}

type MuteButtonProps = ComponentPropsWithoutRef<typeof Button>

export function MuteButton({ className, disabled, ...props }: MuteButtonProps) {
  const { volume, setVolume, handleVolumeWheel } = usePlayerVolume()
  const lastVolumeRef = useRef<number>(0)
  const fixed = useVolumeFixed()

  const isMute = volume === 0

  function handleMuteClick() {
    if (!lastVolumeRef || fixed) return

    const lastVolume = lastVolumeRef.current
    const volumeSafety = lastVolume >= 1 ? lastVolume : 100
    const newVolume = isMute ? volumeSafety : 0

    lastVolumeRef.current = volume
    setVolume(newVolume)
  }

  function handleWheel(e: WheelEvent) {
    if (fixed) return
    const isScrollingDown = e.deltaY > 0
    handleVolumeWheel(isScrollingDown)
  }

  return (
    <Button
      {...props}
      disabled={disabled || fixed}
      variant="ghost"
      size="icon"
      className={cn('p-1 w-7 h-7 hover:bg-transparent', className)}
      onClick={handleMuteClick}
      onWheel={handleWheel}
    />
  )
}

type VolumeSliderProps = ComponentPropsWithoutRef<typeof Slider>

export function VolumeSlider({
  disabled: disabledProp,
  className,
  ...props
}: VolumeSliderProps) {
  const { volume, setVolume, handleVolumeWheel } = usePlayerVolume()
  const { min, max, step } = useVolumeSettings()
  const fixed = useVolumeFixed()
  const disabled = disabledProp || fixed

  function handleWheel(e: WheelEvent) {
    if (fixed) return
    const isScrollingDown = e.deltaY > 0
    handleVolumeWheel(isScrollingDown)
  }

  return (
    <Slider
      className={cn(
        'cursor-pointer w-32',
        className,
        disabled && 'pointer-events-none opacity-50',
      )}
      data-testid="player-volume-slider"
      tooltipValue={volume.toString()}
      {...props}
      value={[volume]}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onValueChange={([value]) => setVolume(value)}
      onWheel={handleWheel}
    />
  )
}
