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

        const shortName = model.replace(/Intel\(R\)|Core\(TM\)/gi, '').replace(/\s+/g, ' ').trim()
        const usageColor = usage > 85 ? 'hsl(var(--red))' : usage > 60 ? 'hsl(var(--orange))' : 'hsl(var(--accent))'
        const tempColor  = pkg   > 85 ? 'hsl(var(--red))' : pkg   > 70 ? 'hsl(var(--orange))' : 'hsl(var(--green))'

        return (
          <div key={cpu.socket} style={{
            borderRadius: 18, padding: '20px 22px',
            background: 'hsl(var(--surface))',
            border: '1px solid hsl(var(--border))',
          }}>
            {/* ── Header ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                {/* Badge */}
                <div style={{
                  width: 52, height: 52, borderRadius: 14, flexShrink: 0,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  background: 'linear-gradient(135deg, hsl(var(--accent) / 0.2), hsl(var(--purple) / 0.15))',
                  border: '1px solid hsl(var(--accent) / 0.4)',
                }}>
                  <span style={{ fontSize: 9, color: 'hsl(var(--muted))', lineHeight: 1 }}>CPU</span>
                  <span style={{ fontSize: 22, fontWeight: 900, color: 'hsl(var(--accent))', lineHeight: 1.1 }}>
                    {cpu.socket}
                  </span>
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'hsl(var(--text))' }}>{shortName}</div>
                  <div style={{ fontSize: 11, color: 'hsl(var(--muted))', marginTop: 2 }}>
                    {coreCount} núcleos · {threadCount} threads · {freq.toFixed(2)} GHz
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 20 }}>
                <Metric label="Uso médio" value={`${Math.round(usage)}%`}      color={usageColor} />
                <Metric label="Package"   value={`${Math.round(pkg)}°C`}       color={tempColor} />
                <Metric label="Freq"      value={`${freq.toFixed(2)} GHz`}     color="hsl(var(--muted))" />
              </div>
            </div>

            {/* ── Sparkline ── */}
            <div style={{ height: 44, marginBottom: 16 }}>
              <Sparkline data={cpuHistory} height={44} color={usageColor} />
            </div>

            {/* ── Legenda ── */}
            <div style={{ display: 'flex', gap: 18, marginBottom: 12, fontSize: 10, color: 'hsl(var(--muted))' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 12, height: 7, borderRadius: 2, background: 'hsl(var(--accent))', display: 'inline-block' }} />
                Atividade (%)
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 12, height: 7, borderRadius: 2, background: 'hsl(32 100% 58%)', display: 'inline-block' }} />
                Temperatura (°C)
              </span>
            </div>

            {/* ── Barras de threads ── */}
            <CoreGrid cores={cpu.cores} pkgTemp={pkg} />
          </div>
        )
      })}
    </div>
  )
}

function CoreGrid({ cores, pkgTemp }: {
  cores: SensorData['cpus_temps'][0]['cores']
  pkgTemp: number
}) {
  const BAR_H = 120  // altura das barras

  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'center',   // centralizado
      gap: 4,
      width: '100%',
      height: BAR_H + 46,         // barras + labels acima e abaixo
      overflowX: 'auto',
      paddingBottom: 2,
    }}>
      {cores.map((core: any) => {
        const usage = Math.min(core.usage ?? 0, 100)
        const temp  = Math.min(core.temp  ?? pkgTemp, 105)

        const usageH = Math.max(4, (usage / 100) * BAR_H)
        const tempH  = Math.max(4, (temp  / 105) * BAR_H)

        const tempColor  = temp  > 85 ? 'hsl(var(--red))' : temp  > 70 ? 'hsl(var(--orange))' : 'hsl(32 100% 58%)'
        const usageColor = usage > 85 ? 'hsl(var(--red))' : usage > 60 ? 'hsl(var(--orange))' : 'hsl(var(--accent))'
        const isHT       = core.is_ht ?? false

        return (
          <div key={core.id} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            flex: '1 1 0',
            minWidth: 16,
            maxWidth: 36,
            opacity: isHT ? 0.75 : 1,  // threads HT levemente mais apagados
          }}>
            {/* Temp acima */}
            <div style={{
              fontSize: 8, fontFamily: 'JetBrains Mono',
              color: tempColor, lineHeight: 1, textAlign: 'center',
              whiteSpace: 'nowrap',
            }}>
              {Math.round(temp)}°
            </div>

            {/* Duas barras */}
            <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: BAR_H, width: '100%' }}>
              {/* Atividade */}
              <div style={{
                flex: 1, height: BAR_H,
                display: 'flex', alignItems: 'flex-end',
                background: 'hsl(var(--border))',
                borderRadius: 4, overflow: 'hidden',
                minWidth: 5,
              }}>
                <div style={{
                  width: '100%',
                  height: `${usageH}px`,
                  background: usageColor,
                  borderRadius: 4,
                  transition: 'height 0.4s cubic-bezier(0.4,0,0.2,1)',
                  boxShadow: usage > 60 ? `0 0 6px ${usageColor}88` : 'none',
                }} />
              </div>
              {/* Temperatura */}
              <div style={{
                flex: 1, height: BAR_H,
                display: 'flex', alignItems: 'flex-end',
                background: 'hsl(var(--border))',
                borderRadius: 4, overflow: 'hidden',
                minWidth: 5,
              }}>
                <div style={{
                  width: '100%',
                  height: `${tempH}px`,
                  background: tempColor,
                  borderRadius: 4,
                  transition: 'height 0.4s cubic-bezier(0.4,0,0.2,1)',
                  boxShadow: temp > 70 ? `0 0 6px ${tempColor}88` : 'none',
                }} />
              </div>
            </div>

            {/* Uso % */}
            <div style={{
              fontSize: 8, fontFamily: 'JetBrains Mono',
              color: usageColor, lineHeight: 1, textAlign: 'center',
            }}>
              {Math.round(usage)}%
            </div>

            {/* Label T0, T1... */}
            <div style={{
              fontSize: 7.5, color: 'hsl(var(--muted))',
              opacity: 0.55, lineHeight: 1, textAlign: 'center',
            }}>
              T{core.id}
            </div>
          </div>
        )
      })}
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
