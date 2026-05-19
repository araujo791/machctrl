import { useRef, useEffect, useState } from 'react'
import { Sparkline } from '../shared/Sparkline'
import type { SensorData } from '../../hooks/useSensorData'

interface CpuPanelProps {
  data: SensorData
  cpuHistory: number[]
}

const HISTORY_LEN = 40

export function CpuPanel({ data, cpuHistory }: CpuPanelProps) {
  const cpusTemps = data.cpus_temps ?? []
  const sockets   = data.cpu?.sockets ?? []

  if (!cpusTemps.length) return (
    <div style={{ textAlign: 'center', padding: 48, color: 'hsl(var(--muted))' }}>
      Aguardando dados do CPU...
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto', height: '100%' }}>
      {cpusTemps.map((cpu) => {
        const sock        = sockets.find(s => s.id === cpu.socket)
        const model       = sock?.model ?? data.cpu?.model ?? `CPU ${cpu.socket}`
        const freq        = sock?.freq  ?? data.cpu?.freq  ?? 0
        const usage       = sock?.usage ?? data.cpu?.usage ?? 0
        const pkg         = cpu.package ?? 0
        const coreCount   = sock?.core_count   ?? Math.ceil(cpu.cores.length / 2)
        const threadCount = sock?.thread_count ?? cpu.cores.length

        const shortName  = model.replace(/Intel\(R\)|Core\(TM\)/gi, '').replace(/\s+/g, ' ').trim()
        const usageColor = usage > 85 ? 'hsl(var(--red))' : usage > 60 ? 'hsl(var(--orange))' : 'hsl(var(--accent))'
        const tempColor  = pkg   > 85 ? 'hsl(var(--red))' : pkg   > 70 ? 'hsl(var(--orange))' : 'hsl(var(--green))'

        return (
          <div key={cpu.socket} style={{
            borderRadius: 18, padding: '20px 22px',
            background: 'hsl(var(--surface))',
            border: '1px solid hsl(var(--border))',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{
                  width: 52, height: 52, borderRadius: 14, flexShrink: 0,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  background: 'linear-gradient(135deg, hsl(var(--accent) / 0.2), hsl(var(--purple) / 0.15))',
                  border: '1px solid hsl(var(--accent) / 0.4)',
                }}>
                  <span style={{ fontSize: 9, color: 'hsl(var(--muted))', lineHeight: 1 }}>CPU</span>
                  <span style={{ fontSize: 22, fontWeight: 900, color: 'hsl(var(--accent))', lineHeight: 1.1 }}>{cpu.socket}</span>
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'hsl(var(--text))' }}>{shortName}</div>
                  <div style={{ fontSize: 11, color: 'hsl(var(--muted))', marginTop: 2 }}>
                    {coreCount} núcleos · {threadCount} threads · {freq.toFixed(2)} GHz
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 20 }}>
                <Metric label="Uso médio" value={`${Math.round(usage)}%`}  color={usageColor} />
                <Metric label="Package"   value={`${Math.round(pkg)}°C`}   color={tempColor} />
                <Metric label="Freq"      value={`${freq.toFixed(2)} GHz`} color="hsl(var(--muted))" />
              </div>
            </div>

            {/* Sparkline geral */}
            <div style={{ height: 44, marginBottom: 16 }}>
              <Sparkline data={cpuHistory} height={44} color={usageColor} />
            </div>

            {/* Grid de threads */}
            <ThreadGrid cores={cpu.cores} pkgTemp={pkg} accentColor={usageColor} />
          </div>
        )
      })}
    </div>
  )
}

function ThreadGrid({ cores, pkgTemp, accentColor }: {
  cores: SensorData['cpus_temps'][0]['cores']
  pkgTemp: number
  accentColor: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [cols, setCols] = useState(8)

  // Histórico de uso por thread: { [threadId]: number[] }
  const historyRef = useRef<Record<number, number[]>>({})

  // Atualiza histórico de cada thread a cada render
  ;(cores as any[]).forEach((thread) => {
    const id = thread.id
    if (!historyRef.current[id]) historyRef.current[id] = []
    const h = historyRef.current[id]
    h.push(Math.min(Number(thread.usage ?? 0), 100))
    if (h.length > HISTORY_LEN) h.splice(0, h.length - HISTORY_LEN)
  })

  // ResizeObserver para colunas responsivas
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const calc = () => {
      const w = el.clientWidth
      // ~90px por célula (quadrado + gap)
      setCols(Math.max(2, Math.floor(w / 90)))
    }
    calc()
    const ro = new ResizeObserver(calc)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: 6,
      }}>
        {(cores as any[]).map((thread) => {
          const usage = Math.min(Number(thread.usage ?? 0), 100)
          const temp  = Math.min(Number(thread.temp  ?? pkgTemp), 105)
          const isHT  = thread.is_ht ?? false
          const history = historyRef.current[thread.id] ?? []

          const usageColor = usage > 85
            ? 'hsl(var(--red))'
            : usage > 60
            ? 'hsl(var(--orange))'
            : accentColor

          const tempColor = temp > 85
            ? 'hsl(var(--red))'
            : temp > 70
            ? 'hsl(var(--orange))'
            : 'hsl(32 100% 58%)'

          const tempPct = (temp / 105) * 100

          return (
            <div
              key={thread.id}
              title={`Thread ${thread.id} | Uso: ${Math.round(usage)}% | Temp: ${Math.round(temp)}°C`}
              style={{
                aspectRatio: '1 / 1',
                borderRadius: 7,
                border: `1px solid ${usageColor}44`,
                background: 'hsl(var(--border) / 0.35)',
                position: 'relative',
                overflow: 'hidden',
                opacity: isHT ? 0.85 : 1,
                display: 'flex',
                flexDirection: 'row',
              }}
            >
              {/* Área principal: gráfico + label */}
              <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>

                {/* Gráfico de uso preenchendo o fundo */}
                <div style={{ position: 'absolute', inset: 0 }}>
                  <Sparkline
                    data={history}
                    height={200}
                    color={usageColor}
                    fill={true}
                    max={100}
                  />
                </div>

                {/* % de uso no centro */}
                <div style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  gap: 1,
                }}>
                  <div style={{
                    fontSize: 13, fontWeight: 700,
                    fontFamily: 'JetBrains Mono',
                    color: usageColor,
                    lineHeight: 1,
                    textShadow: '0 1px 4px hsl(var(--surface))',
                  }}>
                    {Math.round(usage)}%
                  </div>
                  <div style={{
                    fontSize: 7.5,
                    fontFamily: 'JetBrains Mono',
                    color: 'hsl(var(--muted))',
                    opacity: 0.6,
                    lineHeight: 1,
                  }}>
                    T{thread.id}
                  </div>
                </div>
              </div>

              {/* Barra de temperatura na lateral direita */}
              <div style={{
                width: 5,
                background: 'hsl(var(--border))',
                position: 'relative',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'flex-end',
              }}>
                <div style={{
                  position: 'absolute',
                  bottom: 0, left: 0, right: 0,
                  height: `${tempPct}%`,
                  background: tempColor,
                  transition: 'height 0.4s cubic-bezier(0.4,0,0.2,1)',
                  borderRadius: '0 0 2px 2px',
                }} />
                {/* Temp °C tooltip visual — aparece no topo da barra */}
                <div style={{
                  position: 'absolute',
                  bottom: `${tempPct}%`,
                  left: '50%', transform: 'translateX(-50%)',
                  fontSize: 0, // invisível, info no title do container
                }} />
              </div>
            </div>
          )
        })}
      </div>

      {/* Legenda */}
      <div style={{ display: 'flex', gap: 18, marginTop: 12, fontSize: 10, color: 'hsl(var(--muted))' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 12, height: 7, borderRadius: 2, background: accentColor, opacity: 0.5, display: 'inline-block' }} />
          Atividade (%)
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 5, height: 12, borderRadius: 2, background: 'hsl(32 100% 58%)', display: 'inline-block' }} />
          Temperatura (°C)
        </span>
      </div>
    </div>
  )
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: 10, color: 'hsl(var(--muted))' }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 700, fontFamily: 'JetBrains Mono', color }}>{value}</div>
    </div>
  )
}
