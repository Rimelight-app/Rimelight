import { ComponentPropsWithoutRef } from 'react'

/** ClearPlay mark: a soft ring around a rounded play glyph. Original design. */
export function ClearPlayLogo(props: ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-label="ClearPlay" {...props}>
      <circle
        cx="16"
        cy="16"
        r="13"
        stroke="currentColor"
        strokeOpacity="0.55"
        strokeWidth="2"
      />
      <path
        d="M13.2 11.4c0-.9 1-1.5 1.8-1l6.1 3.7c.8.5.8 1.6 0 2.1l-6.1 3.7c-.8.5-1.8-.1-1.8-1v-7.5Z"
        fill="currentColor"
      />
    </svg>
  )
}
