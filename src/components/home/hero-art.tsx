/** Abstract grand-tourer silhouette with a "meridian" horizon line — brand artwork, not a real model. */
export function HeroArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 1200 520" className={className} fill="none" aria-hidden>
      <defs>
        <linearGradient id="hz" x1="0" x2="1">
          <stop offset="0" stopColor="#A88C63" stopOpacity="0" />
          <stop offset="0.5" stopColor="#A88C63" stopOpacity="0.9" />
          <stop offset="1" stopColor="#A88C63" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#B7BBC0" stopOpacity="0.55" />
          <stop offset="1" stopColor="#B7BBC0" stopOpacity="0.08" />
        </linearGradient>
        <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#A88C63" stopOpacity="0.22" />
          <stop offset="1" stopColor="#A88C63" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.06" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
      </defs>
      <ellipse cx="600" cy="400" rx="520" ry="120" fill="url(#glow)" />
      <rect x="0" y="405" width="1200" height="115" fill="url(#floor)" />
      <path d="M60 405H1140" stroke="url(#hz)" strokeWidth="1.2" />
      {/* body */}
      <path d="M196 372c-14-2-22-12-22-26 0-16 8-30 24-38l86-30c44-15 82-24 124-36 56-16 104-46 164-60 52-12 128-14 196-6 56 7 104 26 150 52 30 17 56 26 92 32 40 7 66 16 80 32 12 14 16 32 14 52-1 14-10 24-24 26"
        stroke="#B7BBC0" strokeOpacity="0.9" strokeWidth="1.6" fill="url(#body)" />
      {/* glasshouse */}
      <path d="M452 254c40-34 96-62 164-70 58-6 118-2 168 18 26 10 52 26 74 44" stroke="#FFFFFF" strokeOpacity="0.55" strokeWidth="1.2" />
      <path d="M482 262c38-28 86-48 140-54 52-5 104 0 148 14 20 7 38 17 54 28H482Z" fill="#FFFFFF" fillOpacity="0.05" stroke="#FFFFFF" strokeOpacity="0.25" />
      <path d="M676 210v52" stroke="#FFFFFF" strokeOpacity="0.25" />
      {/* shoulder line */}
      <path d="M232 318c120-14 260-28 410-30 150-2 290 8 410 26" stroke="#FFFFFF" strokeOpacity="0.35" strokeWidth="1" />
      {/* wheels */}
      {[352, 900].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy="372" r="58" fill="#0D0F10" stroke="#B7BBC0" strokeOpacity="0.8" strokeWidth="1.6" />
          <circle cx={cx} cy="372" r="40" stroke="#B7BBC0" strokeOpacity="0.45" />
          <circle cx={cx} cy="372" r="8" fill="#A88C63" fillOpacity="0.8" />
          {Array.from({ length: 10 }).map((_, i) => {
            const a = (i * Math.PI) / 5;
            return <path key={i} d={`M${(cx + Math.cos(a) * 12).toFixed(2)} ${(372 + Math.sin(a) * 12).toFixed(2)}L${(cx + Math.cos(a) * 38).toFixed(2)} ${(372 + Math.sin(a) * 38).toFixed(2)}`} stroke="#B7BBC0" strokeOpacity="0.35" />;
          })}
        </g>
      ))}
      {/* light signatures */}
      <path d="M1036 300c22 2 40 8 52 16" stroke="#FFFFFF" strokeOpacity="0.9" strokeWidth="2" strokeLinecap="round" />
      <path d="M182 318c10-6 22-10 36-12" stroke="#A88C63" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
