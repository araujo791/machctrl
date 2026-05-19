interface RingGaugeProps {
  value: number          // 0–max
  max?: number
  size?: number          // px
  thickness?: number
  color?: string         // CSS color
  trackColor?: string
  label?: string
  unit?: string
  sublabel?: string
  animate?: boolean
}

export function RingGauge({
  value, max = 100, size = 120, thickness = 10,
  color = 'hsl(var(--accent))', trackColor = 'hsl(var(--border))',
  label, unit = '', sublabel, animate = true,
}: RingGaugeProps) {
  const r = (size - thickness) / 2
  const circ = 2 * Math.PI * r
  const pct = Math.min(Math.max(value / max, 0), 1)
  const dash = pct * circ
  const gap  = circ - dash
  const cx = size / 2, cy = size / 2

  const displayVal = Number.isFinite(value) ? (max <= 100 ? Math.round(value) : value.toFixed(1)) : '--'

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ display: 'block' }}>
        {/* Track */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={trackColor} strokeWidth={thickness} />
        {/* Fill */}
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${gap}`}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={animate ? { transition: 'stroke-dasharray 0.8s cubic-bezier(0.4,0,0.2,1)' } : {}}
        />
      </svg>
      {/* Center text */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: size * 0.2,
          fontWeight: 700,
          color,
          lineHeight: 1,
        }}>
          {displayVal}{unit}
        </span>
        {label && (
          <span style={{ fontSize: size * 0.1, color: 'hsl(var(--muted))', marginTop: 2, fontWeight: 500 }}>
            {label}
          </span>
        )}
        {sublabel && (
          <span style={{ fontSize: size * 0.09, color: 'hsl(var(--muted))', opacity: 0.7 }}>
            {sublabel}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Compact ring for core circles ──────────────────────────────────────────────
interface CoreRingProps {
  temp: number
  usage: number
  id: number
}

export function CoreRing({ temp, usage, id }: CoreRingProps) {
  const size = 44
  const cx = size / 2, cy = size / 2
  const outerR = (size - 5) / 2
  const innerR = (size - 16) / 2

  const tempColor  = temp  > 85 ? 'hsl(var(--red))'    : temp  > 70 ? 'hsl(var(--orange))' : 'hsl(var(--green))'
  const usageColor = usage > 85 ? 'hsl(var(--red))'    : usage > 60 ? 'hsl(var(--orange))' : 'hsl(var(--accent))'

  const outerCirc = 2 * Math.PI * outerR
  const innerCirc = 2 * Math.PI * innerR
  const tempOff   = outerCirc - (Math.min(temp,  100) / 100) * outerCirc
  const usageOff  = innerCirc - (Math.min(usage, 100) / 100) * innerCirc

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Outer track (temp) */}
        <circle cx={cx} cy={cy} r={outerR} fill="none" stroke="hsl(var(--border))" strokeWidth="2.5" />
        <circle cx={cx} cy={cy} r={outerR} fill="none" stroke={tempColor} strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={outerCirc}
          strokeDashoffset={tempOff}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4,0,0.2,1)' }}
        />
        {/* Inner track (usage) */}
        <circle cx={cx} cy={cy} r={innerR} fill="none" stroke="hsl(224 18% 8%)" strokeWidth="3" />
        <circle cx={cx} cy={cy} r={innerR} fill="none" stroke={usageColor} strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={innerCirc}
          strokeDashoffset={usageOff}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4,0,0.2,1)' }}
        />
        {/* Usage % center */}
        <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
          fill={usageColor} fontSize="8" fontFamily="JetBrains Mono" fontWeight="700">
          {Math.round(usage)}%
        </text>
        {/* Temp top */}
        <text x={cx} y="3.5" textAnchor="middle"
          fill={tempColor} fontSize="6.5" fontFamily="JetBrains Mono" fontWeight="600">
          {Math.round(temp)}°
        </text>
      </svg>
      <span style={{ fontSize: 8, color: 'hsl(var(--muted))', fontFamily: 'JetBrains Mono' }}>C{id}</span>
    </div>
  )
}
