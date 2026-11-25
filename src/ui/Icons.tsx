import type { ReactNode, SVGProps } from 'react'

export type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Svg({ size = 18, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const IconCursor = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5.5 3.5 19 12l-6.3 1.4L9.4 20 5.5 3.5Z" />
  </Svg>
)
export const IconMove = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3v18M3 12h18M12 3 9 6M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" />
  </Svg>
)
export const IconRotate = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 12a8 8 0 1 1-2.4-5.7" />
    <path d="M20 3.5V9h-5.5" />
  </Svg>
)
export const IconScale = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20 20 4M20 4h-6M20 4v6M4 20h6M4 20v-6" />
  </Svg>
)
export const IconCamera = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.5" y="7" width="13" height="10" rx="2.2" />
    <path d="m15.5 10.5 5-2.5v8l-5-2.5" />
    <circle cx="8" cy="12" r="2.1" />
  </Svg>
)
export const IconGrid = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
  </Svg>
)
export const IconEye = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
)
export const IconEyeOff = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 3l18 18" />
    <path d="M10.6 6.2A9.9 9.9 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3.3 4.1M6.2 7.8A17 17 0 0 0 2.5 12S6 18 12 18a10 10 0 0 0 4-.8" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </Svg>
)
export const IconPlus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)
export const IconTrash = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M9.5 7V4h5v3M6 7l1 13h10l1-13" />
  </Svg>
)
export const IconSave = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 3.5h11l3.5 3.5V20.5H5z" />
    <path d="M8.5 3.5v5.5h7V3.5M8.5 20.5v-6.5h7v6.5" />
  </Svg>
)
export const IconDownload = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.5v11M7.5 10.5 12 15l4.5-4.5M4.5 20.5h15" />
  </Svg>
)
export const IconBack = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14.5 5 7.5 12l7 7" />
  </Svg>
)
export const IconFolder = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 7.2a2 2 0 0 1 2-2h4.2l2 2H19a2 2 0 0 1 2 2v8.6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </Svg>
)
export const IconPlay = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 4.5 19 12 7 19.5z" />
  </Svg>
)
export const IconPause = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 5v14M16 5v14" />
  </Svg>
)
export const IconPin = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 3.5h6l-1 5.5 3 3.2V14H7v-1.8l3-3.2z" />
    <path d="M12 14v6.5" />
  </Svg>
)
export const IconClose = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
)
export const IconReset = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 4.5V10h5.5" />
    <path d="M4.8 14.2a8 8 0 1 0 1.7-8.4" />
  </Svg>
)
export const IconGrip = (p: IconProps) => (
  <Svg {...p} strokeWidth={0} fill="currentColor">
    <circle cx="9" cy="6" r="1.3" />
    <circle cx="15" cy="6" r="1.3" />
    <circle cx="9" cy="12" r="1.3" />
    <circle cx="15" cy="12" r="1.3" />
    <circle cx="9" cy="18" r="1.3" />
    <circle cx="15" cy="18" r="1.3" />
  </Svg>
)
export const IconChevron = (p: IconProps) => (
  <Svg {...p}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
)
export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5 12.5 4.2 4.2L19 7" />
  </Svg>
)
export const IconSettings = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1" />
  </Svg>
)
export const IconUndo = (p: IconProps) => (
  <svg width={p.size ?? 16} height={p.size ?? 16} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M5 6H10.5A3.5 3.5 0 0 1 10.5 13H7" />
    <path d="M7.5 3.5 5 6l2.5 2.5" />
  </svg>
)

export const IconRedo = (p: IconProps) => (
  <svg width={p.size ?? 16} height={p.size ?? 16} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M11 6H5.5A3.5 3.5 0 0 0 5.5 13H9" />
    <path d="M8.5 3.5 11 6 8.5 8.5" />
  </svg>
)

export const IconFilm = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4.5" width="18" height="15" rx="2" />
    <path d="M7 4.5v15M17 4.5v15M3 9h4M3 15h4M17 9h4M17 15h4" />
  </Svg>
)
export const IconInfo = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5M12 7.8v.01" />
  </Svg>
)
export const IconClock = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Svg>
)
export const IconTarget = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="6.4" />
    <path d="M12 1.8v4.2M12 18v4.2M1.8 12h4.2M18 12h4.2" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
  </Svg>
)
export const IconTemplate = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="2.6" />
    <path d="M12 4v3.2M12 16.8V20M4 12h3.2M16.8 12H20M6.4 6.4l2.2 2.2M15.4 15.4l2.2 2.2M17.6 6.4l-2.2 2.2M8.6 15.4l-2.2 2.2" />
  </Svg>
)
export const IconUpload = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 16.5V4M7.5 8.5 12 4l4.5 4.5M4.5 20.5h15" />
  </Svg>
)
