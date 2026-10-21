import type { SVGProps } from 'react'

const base: SVGProps<SVGSVGElement> = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
}

export const CheckIcon = () => (
  <svg {...base}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
)

export const WarningIcon = () => (
  <svg {...base}>
    <path d="M12 9v4M12 17h.01" />
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
  </svg>
)

export const CriticalIcon = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v5M12 16h.01" />
  </svg>
)

export const UnknownIcon = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 12h8" />
  </svg>
)

export const FullIcon = () => (
  <svg {...base}>
    <rect x="3" y="4" width="8" height="16" rx="1.5" />
    <rect x="13" y="4" width="8" height="16" rx="1.5" />
  </svg>
)

export const CompactIcon = () => (
  <svg {...base}>
    <rect x="7" y="3" width="10" height="18" rx="1.5" />
  </svg>
)

export const PinIcon = () => (
  <svg {...base}>
    <path d="M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3z" />
  </svg>
)

export const PauseIcon = () => (
  <svg {...base}>
    <path d="M9 5v14M15 5v14" />
  </svg>
)

export const PlayIcon = () => (
  <svg {...base}>
    <path d="M7 5l12 7-12 7z" />
  </svg>
)

export const ChipIcon = () => (
  <svg {...base} width={22} height={22} strokeWidth={1.8}>
    <rect x="3" y="7" width="18" height="10" rx="1.5" />
    <path d="M7 7V4M11 7V4M15 7V4M19 7V4M7 20v-3M11 20v-3M15 20v-3M19 20v-3" />
  </svg>
)
