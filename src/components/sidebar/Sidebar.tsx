import { Cpu, MemoryStick, HardDrive, Wind, Zap, Trash2, Gauge, Info } from 'lucide-react'

export type Tab = 'overview' | 'cpu' | 'memory' | 'disks' | 'fans' | 'power' | 'cleaner' | 'benchmark' | 'about'

interface SidebarProps {
  active: Tab
  onChange: (tab: Tab) => void
}

const ITEMS: Array<{ id: Tab; icon: any; label: string; divider?: boolean }> = [
  { id: 'overview',   icon: Gauge,       label: 'Visão Geral' },
  { id: 'cpu',        icon: Cpu,         label: 'CPU' },
  { id: 'memory',     icon: MemoryStick, label: 'Memória' },
  { id: 'disks',      icon: HardDrive,   label: 'Discos' },
  { id: 'fans',       icon: Wind,        label: 'Fans' },
  { id: 'power',      icon: Zap,         label: 'Energia', divider: true },
  { id: 'cleaner',    icon: Trash2,      label: 'Limpeza' },
  { id: 'benchmark',  icon: Gauge,       label: 'Benchmark' },
  { id: 'about',      icon: Info,        label: 'Sobre' },
]

export function Sidebar({ active, onChange }: SidebarProps) {
  return (
    <nav style={{
      width: 72,
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '8px 8px 16px',
      gap: 2,
      background: 'hsl(var(--surface))',
      borderRight: '1px solid hsl(var(--border))',
    }}>
      {ITEMS.map((item) => {
        const Icon = item.icon
        const isActive = active === item.id
        return (
          <div key={item.id} style={{ width: '100%' }}>
            {item.divider && (
              <div style={{
                height: 1,
                background: 'hsl(var(--border))',
                margin: '6px 8px',
              }} />
            )}
            <button
              onClick={() => onChange(item.id)}
              title={item.label}
              style={{
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                padding: '10px 4px',
                borderRadius: 14,
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                background: isActive ? 'hsl(var(--accent) / 0.12)' : 'transparent',
                color: isActive ? 'hsl(var(--accent))' : 'hsl(var(--muted))',
                boxShadow: isActive ? '0 0 0 1px hsl(var(--accent) / 0.25)' : 'none',
              }}
            >
              <Icon size={18} strokeWidth={isActive ? 2.5 : 1.8} />
              <span style={{
                fontSize: 9,
                fontWeight: isActive ? 600 : 400,
                letterSpacing: '0.04em',
                lineHeight: 1,
                textAlign: 'center',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                maxWidth: 56,
                textOverflow: 'ellipsis',
              }}>
                {item.label}
              </span>
            </button>
          </div>
        )
      })}
    </nav>
  )
}
