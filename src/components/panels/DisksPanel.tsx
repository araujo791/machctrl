import { HardDrive, ArrowUp, ArrowDown } from 'lucide-react'
import { Sparkline } from '../shared/Sparkline'
import { useEffect, useRef } from 'react'
import type { SensorData } from '../../hooks/useSensorData'

interface DisksPanelProps { data: SensorData }

// Ícone por tipo de disco
function DiskIcon({ type, color }: { type: string; color: string }) {
  if (type === 'nvme') return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="1" y="5" width="18" height="10" rx="2" stroke={color} strokeWidth="1.5" />
      <rect x="3" y="7" width="3" height="2" rx="0.5" fill={color} />
      <rect x="7" y="7" width="3" height="2" rx="0.5" fill={color} />
      <rect x="11" y="7" width="3" height="2" rx="0.5" fill={color} />
      <rect x="3" y="11" width="14" height="1" rx="0.5" fill={color} opacity="0.4" />
    </svg>
  )
  if (type === 'ssd') return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="2" y="3" width="16" height="14" rx="2" stroke={color} strokeWidth="1.5" />
      <rect x="4" y="5" width="5" height="4" rx="0.5" fill={color} opacity="0.6" />
      <rect x="4" y="11" width="12" height="1" rx="0.5" fill={color} opacity="0.4" />
      <rect x="4" y="13" width="8" height="1" rx="0.5" fill={color} opacity="0.3" />
    </svg>
  )
  // HDD
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="2" y="4" width="16" height="12" rx="2" stroke={color} strokeWidth="1.5" />
      <circle cx="10" cy="10" r="3" stroke={color} strokeWidth="1.2" />
      <circle cx="10" cy="10" r="1" fill={color} />
      <rect x="14" y="7" width="2" height="1" rx="0.5" fill={color} opacity="0.5" />
      <rect x="14" y="9" width="2" height="1" rx="0.5" fill={color} opacity="0.5" />
    </svg>
  )
}

function DiskTypeBadge({ type }: { type: string }) {
  const labels: Record<string, { label: string; color: string }> = {
    nvme: { label: 'NVMe', color: 'hsl(217 100% 62%)' },
    ssd:  { label: 'SSD',  color: 'hsl(152 100% 47%)' },
    hdd:  { label: 'HDD',  color: 'hsl(35 100% 55%)' },
  }
  const meta = labels[type] ?? labels.ssd
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
      padding: '2px 6px', borderRadius: 4,
      background: `${meta.color}22`,
      color: meta.color,
      border: `1px solid ${meta.color}44`,
    }}>
      {meta.label}
    </span>
  )
}

export function normalizeDisks(data: any) {
  const raw = data?.disks
  if (!raw) return []
  const partitions = Array.isArray(raw) ? raw : (raw.partitions ?? [])
  const ioRates = raw.io_rates ?? {}
  return (partitions as any[]).map((p: any) => {
    const devKey = (p.device ?? '').replace('/dev/', '')
    const io = ioRates[devKey] ?? ioRates[p.device] ?? {}
    return {
      device:    p.device    ?? '',
      mount:     p.mountpoint ?? p.mount ?? p.device ?? '',
      fstype:    p.fstype    ?? '',
      total_gb:  p.total_gb  ?? 0,
      used_gb:   p.used_gb   ?? 0,
      usage:     p.usage_percent ?? p.usage ?? 0,
      read_mb:   io.read_mb_s  ?? io.read_mb  ?? p.read_mb  ?? 0,
      write_mb:  io.write_mb_s ?? io.write_mb ?? p.write_mb ?? 0,
      disk_type: p.disk_type ?? 'ssd',
    }
  })
}

export function DisksPanel({ data }: DisksPanelProps) {
  const disks  = normalizeDisks(data)
  const ioRef  = useRef<Record<string, { read: number[]; write: number[] }>>({})

  useEffect(() => {
    disks.forEach(d => {
      if (!ioRef.current[d.device]) ioRef.current[d.device] = { read: [], write: [] }
      ioRef.current[d.device].read  = [...ioRef.current[d.device].read.slice(-59),  d.read_mb]
      ioRef.current[d.device].write = [...ioRef.current[d.device].write.slice(-59), d.write_mb]
    })
  })

  if (!disks.length) return (
    <div style={{ textAlign: 'center', padding: 48, color: 'hsl(var(--muted))' }}>Nenhum disco detectado</div>
  )

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14, overflowY: 'auto', height: '100%', alignContent: 'start' }}>
      {disks.map((disk, i) => {
        const pct   = disk.usage
        const color = pct > 85 ? 'hsl(var(--red))' : pct > 65 ? 'hsl(var(--orange))' : 'hsl(var(--accent))'
        const io    = ioRef.current[disk.device] ?? { read: [], write: [] }

        return (
          <div key={i} style={{ padding: '16px 18px', borderRadius: 16, background: 'hsl(var(--surface))', border: '1px solid hsl(var(--border))' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${color}1a`, border: `1px solid ${color}44` }}>
                <DiskIcon type={disk.disk_type} color={color} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <DiskTypeBadge type={disk.disk_type} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'hsl(var(--text))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {disk.mount}
                  </span>
                </div>
                <div style={{ fontSize: 10, color: 'hsl(var(--muted))' }}>
                  {disk.device} · {disk.fstype}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 22, fontWeight: 900, fontFamily: 'JetBrains Mono', color }}>{pct}%</div>
                <div style={{ fontSize: 10, color: 'hsl(var(--muted))' }}>{disk.used_gb.toFixed(1)}/{disk.total_gb.toFixed(1)} GB</div>
              </div>
            </div>

            {/* Barra uso */}
            <div style={{ height: 5, borderRadius: 3, background: 'hsl(var(--border))', marginBottom: 12 }}>
              <div style={{ height: '100%', borderRadius: 3, width: `${pct}%`, background: color, transition: 'width 0.6s ease' }} />
            </div>

            {/* I/O sparklines empilhados */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'hsl(var(--muted))', marginBottom: 2 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <ArrowDown size={9} color="hsl(var(--green))" /> Leitura
                  </span>
                  <span style={{ fontFamily: 'JetBrains Mono', color: 'hsl(var(--green))' }}>
                    {disk.read_mb.toFixed(1)} MB/s
                  </span>
                </div>
                <Sparkline data={io.read} height={28} color="hsl(var(--green))" />
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'hsl(var(--muted))', marginBottom: 2 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <ArrowUp size={9} color="hsl(var(--orange))" /> Escrita
                  </span>
                  <span style={{ fontFamily: 'JetBrains Mono', color: 'hsl(var(--orange))' }}>
                    {disk.write_mb.toFixed(1)} MB/s
                  </span>
                </div>
                <Sparkline data={io.write} height={28} color="hsl(var(--orange))" />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
