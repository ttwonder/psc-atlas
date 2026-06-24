import type { SVGProps } from 'react'

export function CompassMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" {...props}>
      <circle cx="32" cy="32" r="23" stroke="currentColor" strokeWidth="1.8" />
      <path d="M32 3l5.5 23.5L61 32l-23.5 5.5L32 61l-5.5-23.5L3 32l23.5-5.5L32 3Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="m32 13 3 16 16 3-16 3-3 16-3-16-16-3 16-3 3-16Z" fill="currentColor" fillOpacity=".16" />
      <circle cx="32" cy="32" r="3" fill="currentColor" />
    </svg>
  )
}
