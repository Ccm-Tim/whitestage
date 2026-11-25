export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <linearGradient id="ws-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7db4ff" />
          <stop offset="1" stopColor="#3b6bf5" />
        </linearGradient>
      </defs>
      <rect x="1.25" y="1.25" width="45.5" height="45.5" rx="12.5" fill="url(#ws-mark)" opacity="0.16" />
      <rect x="1.25" y="1.25" width="45.5" height="45.5" rx="12.5" fill="none" stroke="rgba(126,172,255,.42)" />
      <circle cx="24" cy="14.2" r="5" fill="#e2ecff" />
      <path
        d="M24 20.6c-4.9 0-7.9 3-7.9 7.9v5.1c0 1.7 1 2.7 2.7 2.7h2.3v-6.6h1.6v6.6h2.6v-6.6h1.6v6.6h2.3c1.7 0 2.7-1 2.7-2.7v-5.1c0-4.9-3-7.9-7.9-7.9Z"
        fill="#e2ecff"
      />
      <path d="M4.5 41.5h39" stroke="rgba(126,172,255,.3)" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

export function Brand({ subtitle = 'WHITESTAGE' }: { subtitle?: string }) {
  return (
    <div className="brand">
      <LogoMark size={38} />
      <div className="brand-text">
        <b>白膜预演台</b>
        <span>{subtitle}</span>
      </div>
    </div>
  )
}
