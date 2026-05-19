import { RingGauge } from '../shared/RingGauge'
import type { SensorData } from '../../hooks/useSensorData'

interface MemoryPanelProps { data: SensorData }

export function MemoryPanel({ data }: MemoryPanelProps) {
  const mem = data.memory
  if (!mem) return <Empty text="Aguardando dados de memória..." />

  const color = mem.usage > 85 ? 'hsl(var(--red))' : mem.usage > 65 ? 'hsl(var(--orange))' : 'hsl(var(--accent))'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', height: '100%' }}>

      {/* Usage header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 20,
        padding: '16px 20px', borderRadius: 16,
        background: 'hsl(var(--surface))',
        border: '1px solid hsl(var(--border))',
      }}>
        <RingGauge value={mem.usage} size={100} thickness={9} color={color} label="RAM" unit="%" />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 28, fontWeight: 800, fontFamily: 'JetBrains Mono', color }}>
            {mem.used_gb.toFixed(1)} <span style={{ fontSize: 16, fontWeight: 400, color: 'hsl(var(--muted))' }}>/ {mem.total_gb.toFixed(1)} GB</span>
          </div>
          <div style={{ marginTop: 6, height: 6, borderRadius: 3, background: 'hsl(var(--border))' }}>
            <div style={{ height: '100%', borderRadius: 3, width: `${mem.usage}%`,
              background: color, transition: 'width 0.6s ease',
              boxShadow: mem.usage > 65 ? `0 0 12px ${color}66` : 'none' }} />
          </div>
          <div style={{ marginTop: 8, display: 'flex', gap: 16 }}>
            <Info label="Total" value={`${mem.total_gb.toFixed(1)} GB`} />
            <Info label="Usado" value={`${mem.used_gb.toFixed(1)} GB`} />
            <Info label="Livre" value={`${(mem.total_gb - mem.used_gb).toFixed(1)} GB`} />
            {mem.total_slots > 0 && (
              <Info label="Slots" value={`${mem.occupied_slots}/${mem.total_slots}`} />
            )}
          </div>
        </div>
      </div>

      {/* Slot details */}
      {mem.slots.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em',
            textTransform: 'uppercase', color: 'hsl(var(--muted))', marginBottom: 10 }}>
            Pentes Instalados
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
            {mem.slots.map((slot, i) => {
              const speed = slot.configured_speed_mhz || slot.speed_mhz
              const hasMfr = slot.manufacturer && slot.manufacturer !== '?'
              const hasPart = slot.part_number && slot.part_number !== '?'
              return (
                <div key={i} style={{
                  padding: '12px 14px', borderRadius: 12,
                  background: 'hsl(var(--surface))',
                  border: '1px solid hsl(var(--border))',
                  transition: 'border-color 0.2s',
                }}>
                  {/* Row 1 */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'hsl(var(--text))' }}>
                      {slot.locator}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'JetBrains Mono',
                      color: 'hsl(var(--accent))' }}>
                      {slot.size_gb} GB {slot.type !== '?' ? slot.type : ''}
                    </span>
                  </div>
                  {/* Row 2: details */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: 11, color: 'hsl(var(--muted))' }}>
                    {hasMfr && <span style={{ color: 'hsl(var(--text))', opacity: 0.8 }}>{slot.manufacturer}</span>}
                    {hasPart && <span>{slot.part_number}</span>}
                    {speed > 0 && (
                      <span><span style={{ color: 'hsl(var(--accent))' }}>{speed}</span> MT/s</span>
                    )}
                    {slot.voltage > 0 && (
                      <span><span style={{ color: 'hsl(var(--orange))' }}>{slot.voltage.toFixed(2)}</span> V</span>
                    )}
                  </div>
                </div>
              )
            })}
            {/* Empty slots */}
            {mem.total_slots > 0 && Array.from({ length: mem.total_slots - mem.occupied_slots }).map((_, i) => (
              <div key={`empty-${i}`} style={{
                padding: '12px 14px', borderRadius: 12,
                background: 'transparent',
                border: '1px dashed hsl(var(--border) / 0.5)',
              }}>
                <span style={{ fontSize: 11, color: 'hsl(var(--muted))', opacity: 0.4 }}>Slot vazio</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {mem.slots.length === 0 && mem.occupied_slots === 0 && (
        <div style={{
          padding: '12px 16px', borderRadius: 12,
          background: 'hsl(var(--surface))',
          border: '1px solid hsl(var(--border))',
          fontSize: 12, color: 'hsl(var(--muted))',
        }}>
          💡 Execute o serviço como root ou configure sudoers para <code>dmidecode</code> e ver detalhes dos módulos.
        </div>
      )}
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'hsl(var(--muted))' }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'hsl(var(--text))', fontFamily: 'JetBrains Mono' }}>{value}</div>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <div style={{ textAlign: 'center', padding: 48, color: 'hsl(var(--muted))', fontSize: 13 }}>{text}</div>
}
