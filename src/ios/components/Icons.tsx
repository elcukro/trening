import type { SVGProps } from 'react'

/**
 * Ikony rysowane kreską w duchu SF Symbols: siatka 24, zaokrąglone końce,
 * grubość 1,8 (paski zakładek 2,0). Bez emoji – emoji psują rytm typograficzny iOS.
 */
type P = SVGProps<SVGSVGElement> & { size?: number }

function Svg({ size = 24, children, ...rest }: P) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  )
}

export function IconToday(p: P) {
  return (
    <Svg {...p}>
      <rect x="3" y="4.5" width="18" height="16" rx="4" />
      <path d="M3 9.5h18M8 2.8v3.4M16 2.8v3.4" />
      <circle cx="12" cy="15" r="2.2" fill="currentColor" stroke="none" />
    </Svg>
  )
}

export function IconWeek(p: P) {
  return (
    <Svg {...p}>
      <path d="M4 6.5h16M4 12h16M4 17.5h16" />
      <circle cx="7.5" cy="6.5" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="13" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="9.5" cy="17.5" r="1.6" fill="currentColor" stroke="none" />
    </Svg>
  )
}

export function IconProgress(p: P) {
  return (
    <Svg {...p}>
      <path d="M3.5 17.5 9 11.5l3.5 3.5L20.5 6" />
      <path d="M20.5 10.5V6h-4.5" />
    </Svg>
  )
}

export function IconMore(p: P) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="8" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="16" cy="12" r="1.1" fill="currentColor" stroke="none" />
    </Svg>
  )
}

export function IconChevron(p: P) {
  return (
    <Svg strokeWidth={2.4} {...p}>
      <path d="M9 5.5 15.5 12 9 18.5" />
    </Svg>
  )
}

export function IconChevronLeft(p: P) {
  return (
    <Svg strokeWidth={2.4} {...p}>
      <path d="M15 5.5 8.5 12 15 18.5" />
    </Svg>
  )
}

export function IconCheck(p: P) {
  return (
    <Svg strokeWidth={2.4} {...p}>
      <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
    </Svg>
  )
}

export function IconClose(p: P) {
  return (
    <Svg strokeWidth={2.2} {...p}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  )
}

export function IconBike(p: P) {
  return (
    <Svg {...p}>
      <circle cx="5.5" cy="16.5" r="4" />
      <circle cx="18.5" cy="16.5" r="4" />
      <path d="M5.5 16.5 10 8h4.5l4 8.5M9 8h5.5M14.5 8l-2 8.5" />
      <circle cx="16" cy="4.5" r="1.4" fill="currentColor" stroke="none" />
    </Svg>
  )
}

export function IconGym(p: P) {
  return (
    <Svg {...p}>
      <path d="M3 9.5v5M6.5 7v10M17.5 7v10M21 9.5v5M6.5 12h11" />
    </Svg>
  )
}

export function IconRest(p: P) {
  return (
    <Svg {...p}>
      <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4 8.4 8.4 0 1 0 20 14.2Z" />
    </Svg>
  )
}

export function IconSun(p: P) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.8v2M12 19.2v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.8 12h2M19.2 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
    </Svg>
  )
}

export function IconHeart(p: P) {
  return (
    <Svg {...p}>
      <path d="M12 20s-7.5-4.6-7.5-9.5A4.5 4.5 0 0 1 12 7.6a4.5 4.5 0 0 1 7.5 2.9C19.5 15.4 12 20 12 20Z" />
    </Svg>
  )
}

export function IconBolt(p: P) {
  return (
    <Svg {...p}>
      <path d="M13.5 2.5 5 13.5h5.5L10 21.5 19 10h-5.8l.3-7.5Z" />
    </Svg>
  )
}

export function IconWatch(p: P) {
  return (
    <Svg {...p}>
      <rect x="6.5" y="6" width="11" height="12" rx="3.5" />
      <path d="M9 6V3.6h6V6M9 18v2.4h6V18M12 9.8V12l1.8 1.2" />
    </Svg>
  )
}

export function IconScale(p: P) {
  return (
    <Svg {...p}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
      <path d="M8.5 9.5 12 13l1.2-4.4" />
      <path d="M7.5 16.5h9" />
    </Svg>
  )
}

export function IconWind(p: P) {
  return (
    <Svg {...p}>
      <path d="M3 8.5h9.5a2.8 2.8 0 1 0-2.8-2.8M3 15.5h13a3 3 0 1 1-3 3M3 12h7" />
    </Svg>
  )
}

export function IconTimer(p: P) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="13.5" r="7.5" />
      <path d="M12 9.5v4l2.5 1.6M9.5 2.8h5" />
    </Svg>
  )
}

export function IconTarget(p: P) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </Svg>
  )
}

export function IconGear(p: P) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 1 1-4 0V20a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3a2 2 0 1 1 0-4h.3A1.6 1.6 0 0 0 4.4 6.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V2.5a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.2a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.1 1.1Z" />
    </Svg>
  )
}

export function IconFood(p: P) {
  return (
    <Svg {...p}>
      <path d="M6 3v8a2.5 2.5 0 0 0 5 0V3M8.5 11v10M17 3c-1.4 1.5-2 3.4-2 5.5 0 1.6.8 2.8 2 3.2V21" />
    </Svg>
  )
}

export function IconShirt(p: P) {
  return (
    <Svg {...p}>
      <path d="M9 3 4 5.5l1.5 4L8 8.8V21h8V8.8l2.5.7 1.5-4L15 3a3 3 0 0 1-6 0Z" />
    </Svg>
  )
}

export function IconFlag(p: P) {
  return (
    <Svg {...p}>
      <path d="M5.5 21V3.8M5.5 4.5h11l-1.8 3.6 1.8 3.6h-11" />
    </Svg>
  )
}

export function IconAdjust(p: P) {
  return (
    <Svg {...p}>
      <path d="M4 7.5h10M17.5 7.5H20M4 16.5h4M11.5 16.5H20" />
      <circle cx="15.5" cy="7.5" r="2.3" />
      <circle cx="9.5" cy="16.5" r="2.3" />
    </Svg>
  )
}
