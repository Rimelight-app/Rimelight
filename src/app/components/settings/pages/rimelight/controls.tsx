import { ReactNode } from 'react'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select'

/** Compact select used across Rimelight settings. */
export function SettingSelect<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: ReactNode }[]
  onChange: (value: T) => void
}) {
  const current = options.find((o) => o.value === value)
  return (
    <Select value={value} onValueChange={(v) => onChange(v as T)}>
      <SelectTrigger className="h-8 min-w-[150px] rounded-full ring-offset-transparent focus:ring-0 focus:ring-transparent text-left">
        <SelectValue>
          <span className="text-sm text-foreground">{current?.label}</span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="end">
        <SelectGroup>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              <span>{o.label}</span>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
