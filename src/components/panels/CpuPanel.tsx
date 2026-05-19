import { useRef, useEffect, useState } from 'react'
import { Sparkline } from '../shared/Sparkline'
import type { SensorData } from '../../hooks/useSensorData'

interface CpuPanelProps {
  data: SensorData
  cpuHistory: number[]
}

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

            {/* Sparkline */}
            <div style={{ height: 44, marginBottom: 16 }}>
              <Sparkline data={cpuHistory} height={44} color={usageColor} />
            </div>

            {/* Grid de threads estilo Windows */}
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

  // Recalcula colunas com base na largura do container
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const calc = () => {
      const w = el.clientWidth
      // Cada quadrado tem ~72px + 6px gap. Calcula quantas cabem.
      const CELL = 78
      const c = Math.max(2, Math.floor(w / CELL))
      setCols(c)
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
        justifyItems: 'center',
      }}>
        {(cores as any[]).map((thread) => {
          const usage = Math.min(Number(thread.usage ?? 0), 100)
          const temp  = Math.min(Number(thread.temp  ?? pkgTemp), 105)
          const isHT  = thread.is_ht ?? false

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

          return (
            <div
              key={thread.id}
              title={`Thread ${thread.id} | Uso: ${Math.round(usage)}% | Temp: ${Math.round(temp)}°C`}
              style={{
                width: '100%',
                aspectRatio: '1 / 1',
                borderRadius: 6,
                border: `1px solid ${usageColor}55`,
                background: 'hsl(var(--border) / 0.4)',
                position: 'relative',
                overflow: 'hidden',
                opacity: isHT ? 0.82 : 1,
                transition: 'border-color 0.3s',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
              }}
            >
              {/* Preenchimento de uso — sobe de baixo */}
              <div style={{
                position: 'absolute',
                bottom: 0, left: 0, right: 0,
                height: `${usage}%`,
                background: `${usageColor}30`,
                transition: 'height 0.4s cubic-bezier(0.4,0,0.2,1)',
              }} />

              {/* % de uso centralizado */}
              <div style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 700,
                fontFamily: 'JetBrains Mono',
                color: usageColor,
                zIndex: 1,
              }}>
                {Math.round(usage)}%
              </div>

              {/* Barinha de temperatura na base */}
              <div style={{
                position: 'absolute',
                bottom: 0, left: 0, right: 0,
                height: 4,
                background: 'hsl(var(--border))',
                zIndex: 2,
              }}>
                <div style={{
                  height: '100%',
                  width: `${(temp / 105) * 100}%`,
                  background: tempColor,
                  transition: 'width 0.4s cubic-bezier(0.4,0,0.2,1)',
                  borderRadius: 2,
                }} />
              </div>

              {/* Label T0, T1... no topo */}
              <div style={{
                position: 'absolute',
                top: 3, left: 0, right: 0,
                textAlign: 'center',
                fontSize: 8,
                fontFamily: 'JetBrains Mono',
                color: 'hsl(var(--muted))',
                opacity: 0.6,
                zIndex: 1,
              }}>
                T{thread.id}
              </div>
            </div>
          )
        })}
      </div>

      {/* Legenda */}
      <div style={{ display: 'flex', gap: 18, marginTop: 12, fontSize: 10, color: 'hsl(var(--muted))' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 12, height: 7, borderRadius: 2, background: accentColor, opacity: 0.4, display: 'inline-block' }} />
          Atividade (%)
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 12, height: 4, borderRadius: 2, background: 'hsl(32 100% 58%)', display: 'inline-block' }} />
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
