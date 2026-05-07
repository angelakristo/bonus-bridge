import { cn } from "@/lib/utils";

/* Suspension cable geometry: M 117,44 C 160,112 320,112 363,44
 * Suspender y-values are approximated from the cubic bezier at each x. */
const SUSPENDERS: { x: number; cy: number; delay: string }[] = [
  { x: 140, cy: 72,  delay: "2.32s" },
  { x: 165, cy: 85,  delay: "2.40s" },
  { x: 190, cy: 95,  delay: "2.48s" },
  { x: 215, cy: 101, delay: "2.56s" },
  { x: 240, cy: 103, delay: "2.62s" },
  { x: 265, cy: 101, delay: "2.68s" },
  { x: 290, cy: 95,  delay: "2.76s" },
  { x: 315, cy: 85,  delay: "2.84s" },
  { x: 340, cy: 72,  delay: "2.92s" },
];

interface Props {
  className?: string;
}

export function BridgeTransition({ className }: Props) {
  return (
    <div
      className={cn("fixed inset-0 z-50 flex flex-col items-center justify-center", className)}
      style={{ background: "linear-gradient(180deg,#0c1e36 0%,#142e52 30%,#1a4a78 60%,#1868a0 100%)", animation: "bb-in 0.3s ease-out" }}
      role="status"
      aria-label="Setup complete — loading your dashboard"
    >
      <style>{`
        @keyframes bb-in   { from{opacity:0} to{opacity:1} }
        @keyframes bb-rise { from{transform:scaleY(0)} to{transform:scaleY(1)} }
        @keyframes bb-draw { to{stroke-dashoffset:0} }
        @keyframes bb-up   { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes bb-pop  { 0%{transform:scale(0);opacity:0} 65%{transform:scale(1.2)} 100%{transform:scale(1);opacity:1} }
        @media(prefers-reduced-motion:reduce){
          .bb-a { animation:none!important }
          .bb-s { animation:none!important; stroke-dashoffset:0!important }
        }
      `}</style>

      {/* Brand title */}
      <div
        className="mb-8 text-center bb-a"
        style={{ animation: "bb-up 0.5s ease-out 0.1s both" }}
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-sky-300/60">
          Welcome to
        </p>
        <h1 className="mt-0.5 text-4xl font-bold tracking-tight text-white">
          BonusBridge
        </h1>
      </div>

      {/* Bridge */}
      <div className="w-full max-w-[500px] px-6">
        <svg viewBox="0 0 480 200" fill="none" aria-hidden="true" className="w-full overflow-visible">

          {/* Water */}
          <rect x="0" y="180" width="480" height="20" fill="#071420" />
          <rect x="0" y="178" width="480" height="5"  fill="#0b1e30" />
          <ellipse cx="85"  cy="189" rx="38" ry="3" stroke="#162d42" strokeWidth="1" opacity="0.7" />
          <ellipse cx="290" cy="192" rx="50" ry="2.5" stroke="#162d42" strokeWidth="1" opacity="0.5" />
          <ellipse cx="430" cy="186" rx="30" ry="2" stroke="#162d42" strokeWidth="1" opacity="0.6" />

          {/* ── LEFT TOWER ── */}
          <rect x="100" y="170" width="34" height="12" fill="#2e5c78" rx="1" />
          <g
            className="bb-a"
            style={{ transformOrigin: "117px 175px", animation: "bb-rise 0.65s cubic-bezier(0.34,1.3,0.64,1) 0.25s both" }}
          >
            <rect x="107" y="44" width="20" height="131" fill="#3d7494" />
            <rect x="104" y="98"  width="26" height="5" fill="#2e5c78" />
            <rect x="104" y="130" width="26" height="5" fill="#2e5c78" />
            <rect x="103" y="41"  width="28" height="9" fill="#4e8aac" rx="1" />
            <rect x="106" y="34"  width="22" height="9" fill="#4e8aac" rx="1" />
          </g>

          {/* ── RIGHT TOWER ── */}
          <rect x="346" y="170" width="34" height="12" fill="#2e5c78" rx="1" />
          <g
            className="bb-a"
            style={{ transformOrigin: "363px 175px", animation: "bb-rise 0.65s cubic-bezier(0.34,1.3,0.64,1) 0.25s both" }}
          >
            <rect x="353" y="44" width="20" height="131" fill="#3d7494" />
            <rect x="350" y="98"  width="26" height="5" fill="#2e5c78" />
            <rect x="350" y="130" width="26" height="5" fill="#2e5c78" />
            <rect x="349" y="41"  width="28" height="9" fill="#4e8aac" rx="1" />
            <rect x="352" y="34"  width="22" height="9" fill="#4e8aac" rx="1" />
          </g>

          {/* Left backstay cable */}
          <path d="M 117,43 L 62,176" stroke="#c99020" strokeWidth="2.5" pathLength="1"
            className="bb-s" style={{ strokeDasharray:"1", strokeDashoffset:"1", animation:"bb-draw 0.45s ease-in 0.9s both" }} />

          {/* Right backstay cable */}
          <path d="M 363,43 L 418,176" stroke="#c99020" strokeWidth="2.5" pathLength="1"
            className="bb-s" style={{ strokeDasharray:"1", strokeDashoffset:"1", animation:"bb-draw 0.45s ease-in 0.9s both" }} />

          {/* Main suspension cable */}
          <path d="M 117,43 C 160,112 320,112 363,43" stroke="#c99020" strokeWidth="2.5" pathLength="1"
            className="bb-s" style={{ strokeDasharray:"1", strokeDashoffset:"1", animation:"bb-draw 0.75s ease-in-out 0.9s both" }} />

          {/* Road deck */}
          <path d="M 70,158 L 410,158" stroke="#5a9cba" strokeWidth="7" strokeLinecap="round" pathLength="1"
            className="bb-s" style={{ strokeDasharray:"1", strokeDashoffset:"1", animation:"bb-draw 0.65s ease-out 1.65s both" }} />
          <path d="M 70,154.5 L 410,154.5" stroke="#7abcd4" strokeWidth="1.5" strokeLinecap="round" pathLength="1"
            className="bb-s" style={{ strokeDasharray:"1", strokeDashoffset:"1", animation:"bb-draw 0.65s ease-out 1.65s both" }} />

          {/* Suspender cables */}
          {SUSPENDERS.map(({ x, cy, delay }) => (
            <line key={x} x1={x} y1={cy} x2={x} y2={158}
              stroke="#3a7898" strokeWidth="1.5" pathLength="1"
              className="bb-s"
              style={{ strokeDasharray:"1", strokeDashoffset:"1", animation:`bb-draw 0.18s ease-out ${delay} both` }} />
          ))}

          {/* Completion badge */}
          <g className="bb-a" style={{ transformOrigin: "240px 94px", animation: "bb-pop 0.4s ease-out 2.55s both" }}>
            <circle cx="240" cy="94" r="20" fill="#15803d" />
            <path d="M 230,94 L 237,101 L 250,86"
              stroke="white" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        </svg>
      </div>

      {/* Status text */}
      <div
        className="mt-6 text-center bb-a"
        style={{ animation: "bb-up 0.4s ease-out 2.5s both" }}
      >
        <p className="text-lg font-semibold text-white">Setup Complete!</p>
        <p className="mt-1 text-sm text-sky-200/75">Taking you to your dashboard…</p>
      </div>
    </div>
  );
}
