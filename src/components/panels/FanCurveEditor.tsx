import { useEffect, useRef, useState } from 'react'

const DEFAULT_CURVE = [
  { temp: 30, pct: 0  },
  { temp: 50, pct: 20 },
  { temp: 65, pct: 50 },
  { temp: 75, pct: 75 },
  { temp: 85, pct: 100 },
]

interface Point { temp: number; pct: number }

interface Props {
  fan: any
  gpuTemp: number
  savedCurve?: Point[]
  onApply: (curve: Point[]) => void
  onReset: () => void
  onClose: () => void
}

const W = 380, H = 220
const PAD = { l: 36, r: 16, t: 16, b: 32 }
const CW = W - PAD.l - PAD.r
const CH = H - PAD.t - PAD.b

function toX(temp: number) { return PAD.l + ((temp - 20) / (100 - 20)) * CW }
function toY(pct: number)  { return PAD.t + ((100 - pct) / 100) * CH }
function fromX(x: number)  { return Math.round(Math.min(100, Math.max(20, 20 + ((x - PAD.l) / CW) * 80))) }
function fromY(y: number)  { return Math.round(Math.min(100, Math.max(0,  100 - ((y - PAD.t) / CH) * 100))) }

export function FanCurveEditor({ fan, gpuTemp, savedCurve, onApply, onReset, onClose }: Props) {
  const [pts, setPts] = useState<Point[]>(savedCurve?.length === 5 ? savedCurve : DEFAULT_CURVE)
  const [drag, setDrag] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  // Interpola % atual na curva
  const interp = (temp: number) => {
    const s = [...pts].sort((a,b) => a.temp - b.temp)
    if (temp <= s[0].temp) return s[0].pct
    if (temp >= s[s.length-1].temp) return s[s.length-1].pct
    for (let i = 0; i < s.length - 1; i++) {
      if (s[i].temp <= temp && temp <= s[i+1].temp) {
        const r = (temp - s[i].temp) / (s[i+1].temp - s[i].temp)
        return s[i].pct + r * (s[i+1].pct - s[i].pct)
      }
    }
    return 0
  }

  const currentPct = Math.round(interp(gpuTemp))

  const getSvgPos = (e: MouseEvent | TouchEvent) => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const rect = svg.getBoundingClientRect()
    const scaleX = W / rect.width
    const scaleY = H / rect.height
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY }
  }

  useEffect(() => {
    if (drag === null) return
    const onMove = (e: MouseEvent | TouchEvent) => {
      const { x, y } = getSvgPos(e)
      setPts(prev => {
        const next = [...prev]
        const newTemp = fromX(x)
        const newPct  = fromY(y)
        // Limita para não cruzar com pontos vizinhos
        const minTemp = drag > 0 ? prev[drag-1].temp + 1 : 20
        const maxTemp = drag < prev.length-1 ? prev[drag+1].temp - 1 : 100
        next[drag] = { temp: Math.min(maxTemp, Math.max(minTemp, newTemp)), pct: newPct }
        return next
      })
    }
    const onUp = () => setDrag(null)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
    }
  }, [drag])

  // Constrói path da curva
  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.temp)},${toY(p.pct)}`).join(' ')
  const fillD = pathD + ` L${toX(pts[pts.length-1].temp)},${toY(0)} L${toX(pts[0].temp)},${toY(0)} Z`

  // Linha vertical da temp atual
  const curTempX = toX(Math.min(100, Math.max(20, gpuTemp)))

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 999,
      background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        background: 'hsl(var(--surface))', borderRadius: 20,
        border: '1px solid hsl(var(--border))',
        padding: 24, width: 440, maxWidth: '95vw',
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        display: 'flex', flexDirection: 'column', gap: 18,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'hsl(var(--text))' }}>
              Curva de Fan — {fan.label}
            </div>
            <div style={{ fontSize: 11, color: 'hsl(var(--muted))', marginTop: 2 }}>
              GPU: <span style={{ color: 'hsl(var(--orange))', fontWeight: 600 }}>{gpuTemp}°C</span>
              &nbsp;→ Fan: <span style={{ color: 'hsl(var(--accent))', fontWeight: 600 }}>{currentPct}%</span>
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: 'hsl(var(--muted))',
            fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: '0 4px',
          }}>×</button>
        </div>

        {/* Gráfico SVG */}
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: '100%', cursor: drag !== null ? 'grabbing' : 'default', userSelect: 'none' }}
        >
          {/* Grid */}
          {[0,25,50,75,100].map(p => (
            <line key={p}
              x1={PAD.l} y1={toY(p)} x2={W - PAD.r} y2={toY(p)}
              stroke="hsl(var(--border))" strokeWidth={0.5} strokeDasharray="3,3"
            />
          ))}
          {[20,40,60,80,100].map(t => (
            <line key={t}
              x1={toX(t)} y1={PAD.t} x2={toX(t)} y2={H - PAD.b}
              stroke="hsl(var(--border))" strokeWidth={0.5} strokeDasharray="3,3"
            />
          ))}
          {/* Eixo Y labels */}
          {[0,25,50,75,100].map(p => (
            <text key={p} x={PAD.l - 4} y={toY(p) + 4}
              textAnchor="end" fontSize={9} fill="hsl(var(--muted))">{p}%</text>
          ))}
          {/* Eixo X labels */}
          {[20,40,60,80,100].map(t => (
            <text key={t} x={toX(t)} y={H - PAD.b + 14}
              textAnchor="middle" fontSize={9} fill="hsl(var(--muted))">{t}°</text>
          ))}

          {/* Área preenchida */}
          <path d={fillD} fill="hsl(var(--accent) / 0.08)" />

          {/* Linha da curva */}
          <path d={pathD} fill="none"
            stroke="hsl(var(--accent))" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
          />

          {/* Linha da temp atual */}
          {gpuTemp > 0 && (
            <>
              <line
                x1={curTempX} y1={PAD.t} x2={curTempX} y2={H - PAD.b}
                stroke="hsl(var(--orange))" strokeWidth={1.5} strokeDasharray="4,2" opacity={0.8}
              />
              <circle cx={curTempX} cy={toY(currentPct)} r={4}
                fill="hsl(var(--orange))" opacity={0.9}
              />
            </>
          )}

          {/* Pontos draggable */}
          {pts.map((p, i) => (
            <g key={i}
              onMouseDown={e => { e.preventDefault(); setDrag(i) }}
              onTouchStart={e => { e.preventDefault(); setDrag(i) }}
              style={{ cursor: 'grab' }}
            >
              <circle cx={toX(p.temp)} cy={toY(p.pct)} r={10} fill="transparent" />
              <circle cx={toX(p.temp)} cy={toY(p.pct)} r={drag === i ? 7 : 5}
                fill={drag === i ? 'hsl(var(--accent))' : 'hsl(var(--surface))'}
                stroke="hsl(var(--accent))" strokeWidth={2}
              />
              <text x={toX(p.temp)} y={toY(p.pct) - 10}
                textAnchor="middle" fontSize={8.5} fill="hsl(var(--accent))" fontWeight={600}>
                {p.pct}%
              </text>
            </g>
          ))}
        </svg>

        {/* Tabela de pontos */}
        <div>
          <div style={{ fontSize: 11, color: 'hsl(var(--muted))', marginBottom: 8 }}>
            Pontos de controle — arraste no gráfico ou edite abaixo:
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
            {pts.map((p, i) => (
              <div key={i} style={{
                background: 'hsl(var(--bg))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 10, padding: '10px 6px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              }}>
                <div style={{ fontSize: 9, color: 'hsl(var(--muted))' }}>Ponto {i+1}</div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <label style={{ fontSize: 9, color: 'hsl(var(--muted))' }}>Temp °C</label>
                  <input type="number" min={i > 0 ? pts[i-1].temp+1 : 20} max={i < pts.length-1 ? pts[i+1].temp-1 : 100}
                    value={p.temp}
                    onChange={e => {
                      const v = Math.min(i < pts.length-1 ? pts[i+1].temp-1 : 100,
                                  Math.max(i > 0 ? pts[i-1].temp+1 : 20, Number(e.target.value)))
                      setPts(prev => { const n=[...prev]; n[i]={...n[i],temp:v}; return n })
                    }}
                    style={{
                      width: 52, textAlign: 'center', padding: '4px 2px',
                      background: 'hsl(var(--surface))', border: '1px solid hsl(var(--border))',
                      borderRadius: 6, color: 'hsl(var(--orange))', fontSize: 12, fontWeight: 700,
                      fontFamily: 'JetBrains Mono',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <label style={{ fontSize: 9, color: 'hsl(var(--muted))' }}>Fan %</label>
                  <input type="number" min={0} max={100}
                    value={p.pct}
                    onChange={e => {
                      const v = Math.min(100, Math.max(0, Number(e.target.value)))
                      setPts(prev => { const n=[...prev]; n[i]={...n[i],pct:v}; return n })
                    }}
                    style={{
                      width: 52, textAlign: 'center', padding: '4px 2px',
                      background: 'hsl(var(--surface))', border: '1px solid hsl(var(--border))',
                      borderRadius: 6, color: 'hsl(var(--accent))', fontSize: 12, fontWeight: 700,
                      fontFamily: 'JetBrains Mono',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Botões */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { setPts(DEFAULT_CURVE); onReset() }} style={{
            flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 12, fontWeight: 600,
            cursor: 'pointer', border: '1px solid hsl(var(--border))',
            background: 'transparent', color: 'hsl(var(--muted))',
          }}>
            Resetar padrão
          </button>
          <button onClick={() => onApply(pts)} style={{
            flex: 2, padding: '10px 0', borderRadius: 10, fontSize: 12, fontWeight: 700,
            cursor: 'pointer', border: 'none',
            background: 'hsl(var(--accent))', color: '#000',
          }}>
            ✓ Aplicar Curva
          </button>
        </div>
      </div>
    </div>
  )
}
