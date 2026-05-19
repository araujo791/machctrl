import { useEffect, useRef, useState } from 'react'
import fanBladeUrl from '../../assets/fan-blade.png'
import type { SensorData } from '../../hooks/useSensorData'

interface FansPanelProps {
  data: SensorData
  onCommand: (cmd: object) => void
}

export function FansPanel({ data, onCommand }: FansPanelProps) {
  // Mostra apenas fans com RPM > 0 OU que têm PWM (controláveis)
  const fans = (data.fans ?? []).filter((f: any) => (f.rpm ?? 0) > 0 || f.has_pwm)

  if (!fans.length) return (
    <div style={{ textAlign: 'center', padding: 48, color: 'hsl(var(--muted))' }}>
      Nenhum ventilador ativo detectado
    </div>
  )

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))',
      gap: 14, overflowY: 'auto', height: '100%', alignContent: 'start',
    }}>
      {fans.map((fan: any, i: number) => (
        <FanCard key={i} fan={fan} onCommand={onCommand} />
      ))}
    </div>
  )
}

function FanCard({ fan, onCommand }: { fan: any; onCommand: (c: object) => void }) {
  const rpm  = fan.rpm ?? 0
  const pct  = fan.speed_percent ?? fan.pwm_pct ?? 0
  const [mode, setMode]         = useState<'auto'|'manual'|'max'>(fan.mode ?? 'auto')
  const [manualPct, setManualPct] = useState<number>(pct > 0 ? pct : 50)
  const [feedback, setFeedback] = useState('')
  const [applying, setApplying] = useState(false)

  const angleRef = useRef(0)
  const rafRef   = useRef<number>()
  const imgRef   = useRef<HTMLImageElement>(null)

  // Animação proporcional ao RPM
  useEffect(() => {
    const degPerFrame = rpm > 0 ? Math.max(0.4, rpm / 350) : 0
    const animate = () => {
      if (imgRef.current) {
        if (degPerFrame > 0) {
          angleRef.current = (angleRef.current + degPerFrame) % 360
          imgRef.current.style.transform = `rotate(${angleRef.current}deg)`
        }
      }
      rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [rpm])

  const sendCmd = (m: 'auto'|'manual'|'max', speed?: number) => {
    if (applying) return
    setMode(m)
    setApplying(true)

    if (m === 'auto') {
      onCommand({ action: 'set_fan_auto', fan: fan.name })
      setFeedback('Automático')
    } else if (m === 'max') {
      onCommand({ action: 'set_fan_speed', fan: fan.name, speed: 100 })
      setFeedback('Máximo — 100%')
    } else {
      const s = speed ?? manualPct
      onCommand({ action: 'set_fan_speed', fan: fan.name, speed: s })
      setFeedback(`Manual — ${s}%`)
    }

    setTimeout(() => { setApplying(false); setFeedback('') }, 2500)
  }

  const rpmColor = rpm > 3500 ? 'hsl(var(--red))' : rpm > 2000 ? 'hsl(var(--orange))' : rpm > 0 ? 'hsl(var(--accent))' : 'hsl(var(--muted))'
  const modeColor = mode === 'auto' ? 'hsl(var(--green))' : mode === 'max' ? 'hsl(var(--orange))' : 'hsl(var(--accent))'

  return (
    <div style={{
      padding: '18px', borderRadius: 16,
      background: 'hsl(var(--surface))',
      border: `1px solid ${rpm > 0 ? 'hsl(var(--border))' : 'hsl(var(--border) / 0.4)'}`,
      display: 'flex', flexDirection: 'column', gap: 14,
      opacity: rpm === 0 && !fan.has_pwm ? 0.5 : 1,
    }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>

        {/* Fan blade PNG animado */}
        <div style={{
          width: 64, height: 64, borderRadius: '50%', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: rpm > 0
            ? 'radial-gradient(circle, hsl(var(--accent) / 0.12), hsl(var(--surface)))'
            : 'hsl(var(--border) / 0.3)',
          border: `2px solid ${rpm > 0 ? 'hsl(var(--accent) / 0.35)' : 'hsl(var(--border))'}`,
          boxShadow: rpm > 0 ? '0 0 14px hsl(var(--accent) / 0.25)' : 'none',
        }}>
          <img
            ref={imgRef}
            src={fanBladeUrl}
            alt="fan"
            style={{
              width: 52, height: 52,
              objectFit: 'contain',
              willChange: 'transform',
              opacity: rpm > 0 ? 1 : 0.35,
              transition: 'opacity 0.4s ease',
            }}
          />
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13, fontWeight: 700, color: 'hsl(var(--text))',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {fan.label}
          </div>
          <div style={{ fontSize: 10, color: 'hsl(var(--muted))', marginTop: 2 }}>
            {feedback
              ? <span style={{ color: 'hsl(var(--green))' }}>✓ {feedback}</span>
              : <span>modo: <span style={{ color: modeColor, fontWeight: 600 }}>
                  {mode === 'auto' ? 'Automático' : mode === 'max' ? 'Máximo' : 'Manual'}
                </span></span>
            }
          </div>
        </div>

        {/* RPM */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 28, fontWeight: 900, fontFamily: 'JetBrains Mono', color: rpmColor, lineHeight: 1 }}>
            {rpm > 0 ? rpm.toLocaleString() : '—'}
          </div>
          <div style={{ fontSize: 10, color: 'hsl(var(--muted))' }}>RPM</div>
        </div>
      </div>

      {/* PWM atual */}
      {fan.has_pwm && pct > 0 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'hsl(var(--muted))', marginBottom: 4 }}>
            <span>PWM atual</span>
            <span style={{ fontFamily: 'JetBrains Mono', color: 'hsl(var(--text))' }}>{pct}%</span>
          </div>
          <div style={{ height: 4, borderRadius: 2, background: 'hsl(var(--border))' }}>
            <div style={{
              height: '100%', borderRadius: 2, width: `${pct}%`,
              background: `linear-gradient(90deg, hsl(var(--accent)), ${pct > 80 ? 'hsl(var(--orange))' : 'hsl(var(--accent))'})`,
              transition: 'width 0.5s ease',
            }} />
          </div>
        </div>
      )}

      {/* Slider de velocidade manual */}
      {mode === 'manual' && fan.has_pwm && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'hsl(var(--muted))', marginBottom: 6 }}>
            <span>Velocidade manual</span>
            <span style={{ fontFamily: 'JetBrains Mono', color: 'hsl(var(--accent))', fontWeight: 700 }}>{manualPct}%</span>
          </div>
          <input
            type="range" min={15} max={100} step={5}
            value={manualPct}
            onChange={e => setManualPct(Number(e.target.value))}
            onMouseUp={e => sendCmd('manual', Number((e.target as HTMLInputElement).value))}
            onTouchEnd={e => sendCmd('manual', Number((e.target as HTMLInputElement).value))}
            style={{ width: '100%', accentColor: 'hsl(var(--accent))', cursor: 'pointer' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'hsl(var(--muted))', opacity: 0.5, marginTop: 2 }}>
            <span>Mínimo 15%</span><span>Máximo 100%</span>
          </div>
        </div>
      )}

      {/* Botões de modo */}
      {fan.has_pwm && (
        <div style={{ display: 'flex', gap: 6 }}>
          {(['auto', 'manual', 'max'] as const).map(m => (
            <button key={m} onClick={() => sendCmd(m)} disabled={applying} style={{
              flex: 1, padding: '8px 0', borderRadius: 9,
              fontSize: 11, fontWeight: 600, cursor: applying ? 'wait' : 'pointer',
              border: `1px solid ${mode === m
                ? (m === 'auto' ? 'hsl(var(--green) / 0.5)' : m === 'max' ? 'hsl(var(--orange) / 0.5)' : 'hsl(var(--accent) / 0.5)')
                : 'hsl(var(--border))'}`,
              background: mode === m
                ? (m === 'auto' ? 'hsl(var(--green) / 0.1)' : m === 'max' ? 'hsl(var(--orange) / 0.1)' : 'hsl(var(--accent) / 0.1)')
                : 'transparent',
              color: mode === m
                ? (m === 'auto' ? 'hsl(var(--green))' : m === 'max' ? 'hsl(var(--orange))' : 'hsl(var(--accent))')
                : 'hsl(var(--muted))',
              transition: 'all 0.15s',
              opacity: applying ? 0.6 : 1,
            }}>
              {m === 'auto' ? 'Auto' : m === 'manual' ? 'Manual' : 'Máximo'}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
