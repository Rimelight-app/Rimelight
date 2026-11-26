import { ComponentPropsWithoutRef } from 'react'

/** Rimelight logo (white rounded square, grooved disc). Source: build/icon.svg */
export function RimelightLogo(props: ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg viewBox="0 0 100 100" aria-label="Rimelight" {...props}>
      <rect x="2" y="2" width="96" height="96" rx="22" fill="#F4F4F5" />
      <circle cx="50" cy="50" r="31" fill="#0B0B0E" />
      <circle
        cx="50.78"
        cy="50"
        r="25.63"
        fill="none"
        stroke="#F4F4F5"
        strokeWidth="1.9"
      />
      <circle
        cx="52.32"
        cy="50"
        r="21.02"
        fill="none"
        stroke="#F4F4F5"
        strokeWidth="1.9"
      />
      <circle
        cx="54.56"
        cy="50"
        r="17.11"
        fill="none"
        stroke="#F4F4F5"
        strokeWidth="1.9"
      />
      <circle cx="57.4" cy="50" r="13.8" fill="#F4F4F5" />
    </svg>
  )
}
