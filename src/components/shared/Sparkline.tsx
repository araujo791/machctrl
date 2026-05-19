interface SparklineProps {
  data: number[]
  width?: number
  height?: number
  color?: string
  fill?: boolean
  max?: number
}

export function Sparkline({ data, width = 200, height = 48, color = 'hsl(var(--accent))', fill = true, max = 100 }: SparklineProps) {
  if (!data.length) return null
  const pts = data.slice(-60)
  const len = pts.length
  const w   = width / (len - 1 || 1)
  const peak = Math.max(...pts, max * 0.1)

  const points = pts.map((v, i) => {
    const x = i * w
    const y = height - (v / peak) * (height - 4)
    return `${x},${y}`
  }).join(' ')

  const polyFill = `${points} ${(len-1)*w},${height} 0,${height}`

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      {fill && (
        <polygon points={polyFill} fill={`${color}`} opacity={0.12} />
      )}
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
