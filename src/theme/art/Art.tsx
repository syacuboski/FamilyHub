// Original Starlight line art from the mockups: crescent moon with orbit rings,
// a thorny vine and four-point stars. Purely decorative (aria-hidden).

const Star = ({ x, y, s = 1 }: { x: number; y: number; s?: number }) => (
  <path transform={`translate(${x} ${y}) scale(${s})`} d="M0 -7 L1.5 -1.5 L7 0 L1.5 1.5 L0 7 L-1.5 1.5 L-7 0 L-1.5 -1.5Z" />
);

/** Large header art for the Today screen. */
export function MoonHero() {
  return (
    <svg className="art art-hero" width="230" height="210" viewBox="0 0 230 210" aria-hidden="true">
      <circle cx="162" cy="68" r="54" fill="none" stroke="var(--accent)" strokeWidth="1" strokeOpacity="0.35" />
      <circle cx="162" cy="68" r="64" fill="none" stroke="var(--accent)" strokeWidth="0.8" strokeOpacity="0.18" strokeDasharray="2 6" />
      <circle cx="162" cy="68" r="38" fill="var(--accent)" />
      <circle cx="180" cy="55" r="34" fill="var(--art-moon-cut)" />
      <path d="M30 96 L60 40 L104 82 L82 132" fill="none" stroke="var(--accent)" strokeWidth="0.8" strokeOpacity="0.45" />
      <g fill="none" stroke="var(--accent)" strokeWidth="1.2" strokeLinecap="round">
        <path d="M234 112 C 204 120, 186 150, 150 166 S 96 184, 70 214" />
        <path d="M206 122 l11 -6 -3 11" />
        <path d="M178 148 l12 1 -9 8" />
        <path d="M132 172 l1 -12 8 8" />
        <path d="M98 190 l-11 -3 9 -7" />
        <path d="M190 134 q16 -12 28 -2 q-14 12 -28 2z" />
      </g>
      <g fill="var(--accent)">
        <Star x={60} y={40} />
        <Star x={104} y={82} s={0.6} />
        <Star x={82} y={132} s={0.5} />
        <Star x={214} y={150} s={0.7} />
        <circle cx="30" cy="96" r="1.6" />
        <circle cx="128" cy="22" r="1.2" />
        <circle cx="218" cy="20" r="1.2" />
        <circle cx="120" cy="112" r="1" />
        <circle cx="196" cy="190" r="1.2" />
      </g>
    </svg>
  );
}

/** Small corner art used on every other screen. */
export function MoonCorner() {
  return (
    <svg className="art art-corner" width="150" height="130" viewBox="0 0 150 130" aria-hidden="true">
      <circle cx="104" cy="46" r="40" fill="none" stroke="var(--accent)" strokeWidth="0.8" strokeOpacity="0.18" strokeDasharray="2 6" />
      <circle cx="104" cy="46" r="32" fill="none" stroke="var(--accent)" strokeWidth="1" strokeOpacity="0.35" />
      <circle cx="104" cy="46" r="22" fill="var(--accent)" />
      <circle cx="115" cy="38" r="20" fill="var(--art-moon-cut)" />
      <g fill="none" stroke="var(--accent)" strokeWidth="1.1" strokeLinecap="round">
        <path d="M152 80 C 132 86, 118 104, 92 112 S 62 122, 50 134" />
        <path d="M134 86 l9 -5 -2 10" />
        <path d="M106 106 l10 0 -7 7" />
      </g>
      <g fill="var(--accent)">
        <Star x={40} y={30} s={0.8} />
        <Star x={64} y={76} s={0.5} />
        <circle cx="18" cy="60" r="1.3" />
        <circle cx="140" cy="12" r="1.1" />
        <circle cx="76" cy="12" r="1" />
      </g>
    </svg>
  );
}

/** Soft eclipse glow behind the Meals card deck. */
export function EclipseGlow() {
  return (
    <svg className="art art-glow" width="390" height="420" viewBox="0 0 390 420" aria-hidden="true">
      <circle cx="70" cy="150" r="96" fillOpacity="0.22" fill="var(--accent)" />
      <circle cx="104" cy="122" r="88" fill="var(--art-moon-cut)" />
      <circle cx="320" cy="300" r="70" fillOpacity="0.16" fill="var(--violet)" />
      <g fillOpacity="0.7" fill="var(--accent)">
        <Star x={300} y={60} />
        <Star x={240} y={200} s={0.6} />
        <Star x={60} y={330} s={0.7} />
        <circle cx="180" cy="40" r="1.6" />
        <circle cx="350" cy="160" r="1.4" />
        <circle cx="150" cy="280" r="1.3" />
      </g>
    </svg>
  );
}
