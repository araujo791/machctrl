import { useState, useEffect } from 'react'
import { Leaf, Settings2, Zap, Battery, Cpu, Gauge } from 'lucide-react'
import type { SensorData } from '../../hooks/useSensorData'

const PROFILES = [
  {
    id: 'economia',
    raw: ['silent', 'powersave', 'economia'],
    label: 'Economia',
    icon: Leaf,
    desc: 'Baixo consumo · Silencioso · Sem turbo',
    color: 'hsl(152 100% 42%)',
    bg: 'hsl(152 100% 42% / 0.1)',
    border: 'hsl(152 100% 42% / 0.4)',
  },
  {
    id: 'balanced',
    raw: ['balanced', 'schedutil'],
    label: 'Equilibrado',
    icon: Settings2,
    desc: 'Desempenho adaptativo · Recomendado',
    color: 'hsl(217 100% 62%)',
    bg: 'hsl(217 100% 62% / 0.1)',
    border: 'hsl(217 100% 62% / 0.4)',
  },
  {
    id: 'performance',
    raw: ['performance'],
    label: 'Desempenho',
    icon: Zap,
    desc: 'Máximo desempenho · Turbo ativo',
    color: 'hsl(32 100% 55%)',
    bg: 'hsl(32 100% 55% / 0.1)',
    border: 'hsl(32 100% 55% / 0.4)',
  },
]

function canonicalize(id: string): string {
  if (!id) return 'balanced'
  if (['silent', 'powersave', 'economia'].includes(id)) return 'economia'
  if (id === 'performance') return 'performance'
  return 'balanced'
}

interface PowerPanelProps {
  data: SensorData
  onCommand: (cmd: object) => void
}

export function PowerPanel({ data, onCommand }: PowerPanelProps) {
  // Lê o perfil atual do backend
  const backendProfile = data.power_profile?.current ?? (data as any).current_profile ?? 'balanced'
  const available      = data.power_profile?.available ?? (data as any).available_profiles ?? []
  const governor       = data.power_profile?.current_governor ?? (data as any).current_governor ?? ''

  // Estado local para evitar reset visual ao receber update
  const [activeCanon, setActiveCanon] = useState(() => canonicalize(backendProfile))
  const [applying, setApplying]       = useState(false)
  const [feedback, setFeedback]       = useState('')

  // Sincroniza com backend apenas se não estiver aplicando
  useEffect(() => {
    if (!applying) {
      setActiveCanon(canonicalize(backendProfile))
    }
  }, [backendProfile, applying])

  const handleSelect = (p: typeof PROFILES[0]) => {
    if (applying) return
    // Encontra o raw id que o backend aceita
    const raw = available.find((a: string) => p.raw.includes(a)) ?? p.raw[0]
    setActiveCanon(p.id)
    setApplying(true)
    setFeedback('')
    // Backend espera "action" não "type"
    onCommand({ action: 'set_profile', profile: raw })
    // Libera após 2s (tempo para o backend aplicar e responder)
    setTimeout(() => {
      setApplying(false)
      setFeedback(`Perfil "${p.label}" aplicado`)
      setTimeout(() => setFeedback(''), 3000)
    }, 2000)
  }

  // Info extra por perfil
  const extraInfo: Record<string, { power: string; turbo: string; perf: string }> = {
    economia:    { power: 'Baixo',  turbo: 'Desligado', perf: '15–50%' },
    balanced:    { power: 'Médio',  turbo: 'Automático', perf: '20–80%' },
    performance: { power: 'Alto',   turbo: 'Ligado',     perf: '30–100%' },
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 900 }}>

      {/* Status atual */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', borderRadius: 12,
        background: 'hsl(var(--surface))', border: '1px solid hsl(var(--border))',
      }}>
        <div style={{ fontSize: 12, color: 'hsl(var(--muted))' }}>
          Governador: <span style={{ color: 'hsl(var(--text))', fontFamily: 'JetBrains Mono', fontWeight: 600 }}>
            {governor || backendProfile}
          </span>
        </div>
        {feedback && (
          <div style={{ fontSize: 11, color: 'hsl(var(--green))', fontWeight: 600 }}>✓ {feedback}</div>
        )}
        {applying && (
          <div style={{ fontSize: 11, color: 'hsl(var(--muted))' }}>Aplicando...</div>
        )}
      </div>

      {/* Perfis */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {PROFILES.map(p => {
          const isActive = activeCanon === p.id
          const isAvail  = p.raw.some(r => available.includes(r)) || available.length === 0
          const Icon     = p.icon
          const info     = extraInfo[p.id]

          return (
            <button
              key={p.id}
              onClick={() => isAvail && !applying && handleSelect(p)}
              disabled={!isAvail || applying}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
                padding: '24px 16px', borderRadius: 18, cursor: isAvail && !applying ? 'pointer' : 'not-allowed',
                border: `2px solid ${isActive ? p.border : 'hsl(var(--border))'}`,
                background: isActive ? p.bg : 'hsl(var(--surface))',
                boxShadow: isActive ? `0 4px 24px ${p.color}33` : 'none',
                opacity: isAvail ? 1 : 0.35,
                transition: 'all 0.25s ease',
                position: 'relative',
              }}
            >
              {/* Badge ATIVO */}
              {isActive && (
                <div style={{
                  position: 'absolute', top: 10, right: 12,
                  fontSize: 9, fontWeight: 800, letterSpacing: '0.1em',
                  padding: '2px 7px', borderRadius: 5,
                  background: p.color, color: '#000',
                }}>
                  ATIVO
                </div>
              )}

              {/* Ícone */}
              <div style={{
                width: 56, height: 56, borderRadius: 16,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isActive ? p.color : 'hsl(var(--border))',
                boxShadow: isActive ? `0 4px 16px ${p.color}66` : 'none',
                transition: 'all 0.25s',
              }}>
                <Icon size={26} color={isActive ? '#000' : 'hsl(var(--muted))'} strokeWidth={2} />
              </div>

              {/* Nome */}
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: isActive ? p.color : 'hsl(var(--text))', marginBottom: 4 }}>
                  {p.label}
                </div>
                <div style={{ fontSize: 10, color: 'hsl(var(--muted))', lineHeight: 1.5 }}>{p.desc}</div>
              </div>

              {/* Detalhes */}
              <div style={{
                width: '100%', display: 'flex', flexDirection: 'column', gap: 4,
                padding: '10px 12px', borderRadius: 10,
                background: 'hsl(var(--bg))', border: '1px solid hsl(var(--border))',
              }}>
                <InfoRow icon={<Battery size={10} />} label="Consumo"  value={info.power}  color={p.color} active={isActive} />
                <InfoRow icon={<Cpu size={10} />}     label="Turbo"    value={info.turbo}  color={p.color} active={isActive} />
                <InfoRow icon={<Gauge size={10} />}   label="CPU"      value={info.perf}   color={p.color} active={isActive} />
              </div>
            </button>
          )
        })}
      </div>

      {/* Nota */}
      <div style={{ fontSize: 10, color: 'hsl(var(--muted))', opacity: 0.6, textAlign: 'center' }}>
        O perfil é aplicado imediatamente e persiste até reiniciar o serviço. Para persistir após reboot, configure o <code>cpupower</code> no systemd.
      </div>
    </div>
  )
}

function InfoRow({ icon, label, value, color, active }: any) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10 }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'hsl(var(--muted))' }}>
        {icon} {label}
      </span>
      <span style={{ fontWeight: 600, fontFamily: 'JetBrains Mono', color: active ? color : 'hsl(var(--text))' }}>
        {value}
      </span>
    </div>
  )
}
