import { useState, useEffect } from 'react'
import { t } from '../../i18n'
import { RingGauge } from '../shared/RingGauge'
import { Sparkline } from '../shared/Sparkline'
import { normalizeDisks } from './DisksPanel'
import type { SensorData } from '../../hooks/useSensorData'

interface OverviewProps {
  data: SensorData
  cpuHistory: number[]
  tempHistory: number[]
}

const colorPct  = (v: number) => v > 85 ? 'hsl(var(--red))' : v > 65 ? 'hsl(var(--orange))' : 'hsl(var(--accent))'
const colorTemp = (t: number) => t > 85 ? 'hsl(var(--red))' : t > 70 ? 'hsl(var(--orange))' : 'hsl(var(--green))'

function detectCpuBrand(m: string) {
  const s = m.toLowerCase()
  if (s.includes('intel')) return 'intel'
  if (s.includes('amd') || s.includes('ryzen') || s.includes('epyc')) return 'amd'
  return 'unknown'
}
function detectGpuBrand(n: string) {
  const s = (n || '').toLowerCase()
  if (s.includes('nvidia') || s.includes('geforce') || s.includes('rtx') || s.includes('gtx')) return 'nvidia'
  if (s.includes('amd') || s.includes('radeon') || s.includes('rx ')) return 'amd'
  return 'unknown'
}
function IntelLogo() {
  return <svg width="44" height="20" viewBox="0 0 80 36"><rect width="80" height="36" rx="5" fill="#0071C5"/><text x="40" y="25" textAnchor="middle" fill="white" fontSize="18" fontWeight="900" fontFamily="Arial">intel</text></svg>
}
function AMDLogo() {
  return <svg width="40" height="20" viewBox="0 0 72 36"><rect width="72" height="36" rx="5" fill="#ED1C24"/><text x="36" y="25" textAnchor="middle" fill="white" fontSize="17" fontWeight="900" fontFamily="Arial">AMD</text></svg>
}
function fmtBytes(mb: number) { return mb >= 1024 ? `${(mb/1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB` }
function fmtSecs(s: number) { if (!s || s <= 0) return ''; const h = Math.floor(s/3600), m = Math.floor((s%3600)/60); return h > 0 ? `${h}h ${m}m` : `${m}m` }
function fmtStorage(gb: number) { return gb >= 1024 ? `${(gb/1024).toFixed(1)} TB` : `${Math.round(gb)} GB` }
function fmtSpeed(mbps: number) {
  if (mbps >= 1) return `${mbps.toFixed(1)} MB/s`
  const kb = mbps * 1024
  return `${kb.toFixed(0)} KB/s`
}

// ── Card base ──────────────────────────────────────────────────────────────────
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      padding: '14px 16px', borderRadius: 14,
      background: 'hsl(var(--surface))',
      border: '1px solid hsl(var(--border))',
      ...style,
    }}>
      {children}
    </div>
  )
}
function CardTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'hsl(var(--muted))', marginBottom: 10 }}>{children}</div>
}
function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
      <span style={{ color: 'hsl(var(--muted))' }}>{label}</span>
      <span style={{ fontWeight: 600, fontFamily: 'JetBrains Mono', color: color ?? 'hsl(var(--text))' }}>{value}</span>
    </div>
  )
}

export function OverviewPanel({ data, cpuHistory }: OverviewProps) {
  const sys        = (data as any).system ?? {}
  const cpu        = data.cpu
  const mem        = data.memory
  const disks      = normalizeDisks(data)
  const procs      = (data as any).top_processes ?? []
  const cpuTemps   = data.cpus_temps ?? []
  const gpu        = (data as any).gpu ?? {}
  const network    = (data as any).network ?? { adapters: [] }
  const powerWatts = (data as any).power_watts ?? 0

  const gpuTemp   = gpu.temp ?? (data.temperatures as any)?.gpu ?? 0
  const gpuName   = gpu.model || sys.gpu_name || ''
  const gpuVendor = gpu.vendor || (detectGpuBrand(gpuName) === 'nvidia' ? 'NVIDIA' : detectGpuBrand(gpuName) === 'amd' ? 'AMD' : '')
  const gpuBrand  = detectGpuBrand(gpuName)
  const gpuUsage  = gpu.usage ?? 0
  const gpuDriver = gpu.driver ?? ''

  const cpuModel = cpu?.model ?? cpu?.sockets?.[0]?.model ?? ''
  const cpuShort = cpuModel.replace(/Intel\(R\)|Core\(TM\)/gi, '').replace(/\s+/g, ' ').trim().split('@')[0].trim()
  const cpuBrand = detectCpuBrand(cpuModel)
  const battery  = sys.battery
  const totalDiskGb = sys.total_storage_gb ?? 0
  const sysDisk  = disks.find((d: any) => d.mount === '/') ?? disks[0]

  const ramUsed  = mem?.used_gb ?? 0
  const ramTotal = mem?.total_gb ?? 0
  const ramFree  = ramTotal - ramUsed
  const swapInfo = (data as any).swap ?? null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', height: '100%', paddingRight: 4 }}>

      {/* ── Row 1: Info Sistema ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'hsl(var(--text))', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
              {sys.board || sys.hostname || t('system')}
            </div>
            {powerWatts > 0 && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '3px 10px', borderRadius: 8,
                background: powerWatts > 150 ? 'hsl(var(--red) / 0.12)' : powerWatts > 80 ? 'hsl(var(--orange) / 0.12)' : 'hsl(var(--green) / 0.12)',
                border: `1px solid ${powerWatts > 150 ? 'hsl(var(--red) / 0.3)' : powerWatts > 80 ? 'hsl(var(--orange) / 0.3)' : 'hsl(var(--green) / 0.3)'}`,
              }}>
                <span style={{ fontSize: 13 }}>⚡</span>
                <span style={{
                  fontSize: 15, fontWeight: 800, fontFamily: 'JetBrains Mono',
                  color: powerWatts > 150 ? 'hsl(var(--red))' : powerWatts > 80 ? 'hsl(var(--orange))' : 'hsl(var(--green))',
                }}>
                  {powerWatts} W
                </span>
              </div>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'hsl(var(--muted))', marginBottom: 12 }}>
            {sys.os} · Kernel {sys.kernel}
            {sys.install_date && ` · Instalado em ${sys.install_date}`}
          </div>
          <div style={{ height: 1, background: 'hsl(var(--border))', marginBottom: 12 }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 24px' }}>
            <Spec label={t('processor')} value={cpuShort || '—'} />
            <Spec label="GPU"         value={gpuName  || '—'} />
            <Spec label={t('memory')}     value={`${ramTotal.toFixed(0)} GB RAM`} />
            <Spec label={t('storage')} value={totalDiskGb > 0 ? fmtStorage(totalDiskGb) : '—'} />
            {sys.bios_date && <Spec label="BIOS" value={`${sys.bios_vendor || ''} ${sys.bios_date}`.trim()} />}
            {sys.uptime && <Spec label="Uptime" value={sys.uptime} />}
          </div>
        </div>

        {battery && (
          <div style={{ minWidth: 160 }}>
            <Card>
              <CardTitle>{t('battery')}</CardTitle>
              <div style={{ fontSize: 28, fontWeight: 800, fontFamily: 'JetBrains Mono', color: battery.percent > 20 ? 'hsl(var(--green))' : 'hsl(var(--red))', marginBottom: 6 }}>
                {battery.percent}%
              </div>
              <div style={{ height: 8, borderRadius: 4, background: 'hsl(var(--border))', overflow: 'hidden', marginBottom: 4 }}>
                <div style={{ height: '100%', borderRadius: 4, width: `${battery.percent}%`,
                  background: battery.percent > 50 ? 'hsl(var(--green))' : battery.percent > 20 ? 'hsl(var(--orange))' : 'hsl(var(--red))',
                  transition: 'width 0.5s' }} />
              </div>
              {battery.secsleft > 0 && !battery.plugged &&
                <div style={{ fontSize: 10, color: 'hsl(var(--muted))' }}>{fmtSecs(battery.secsleft)} restantes</div>}
            </Card>
          </div>
        )}
      </div>

      {/* ── Row 2: RAM + GPU + CPU + Disco + Rede ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))', gap: 12, alignItems: 'start' }}>

        {/* RAM */}
        <Card>
          <CardTitle>{t('ramMemory')}</CardTitle>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 10 }}>
            <RingGauge value={mem?.usage ?? 0} size={80} thickness={8} color={colorPct(mem?.usage ?? 0)} label="RAM" unit="%" />
            <div style={{ flex: 1 }}>
              <Row label="Em uso" value={`${ramUsed.toFixed(1)} GB`} color={colorPct(mem?.usage ?? 0)} />
              <Row label={t('free')}  value={`${ramFree.toFixed(1)} GB`} />
              <Row label={t('total')}  value={`${ramTotal.toFixed(1)} GB`} />
              {swapInfo && <Row label="Swap" value={`${swapInfo.used_gb?.toFixed(1)}/${swapInfo.total_gb?.toFixed(1)} GB`} />}
            </div>
          </div>
          {procs.length > 0 && (
            <>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(var(--muted))', marginBottom: 6 }}>Top Processos</div>
              {procs.slice(0, 10).map((p: any, i: number) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <div style={{ fontSize: 9, color: 'hsl(var(--muted))', width: 14, textAlign: 'right', flexShrink: 0 }}>{i+1}</div>
                  <div style={{ flex: 1, fontSize: 11, color: 'hsl(var(--text))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                  <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono', color: 'hsl(var(--accent))', flexShrink: 0 }}>{fmtBytes(p.mem_mb)}</div>
                  <div style={{ width: 40, flexShrink: 0 }}>
                    <div style={{ height: 3, borderRadius: 2, background: 'hsl(var(--border))' }}>
                      <div style={{ height: '100%', borderRadius: 2, background: 'hsl(var(--accent))',
                        width: `${Math.min(100, p.mem_mb / (ramTotal * 10.24))}%`, transition: 'width 0.4s' }} />
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </Card>

        {/* GPU */}
        {(gpuTemp > 0 || gpuName) && (
          <Card>
            {/* Vendedor pequeno + modelo grande */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'hsl(var(--muted))', marginBottom: 3 }}>
                {gpuVendor || 'GPU'}
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'hsl(var(--text))', lineHeight: 1.2, wordBreak: 'break-word' }}>
                {gpuName || t('videoCard')}
              </div>
            </div>

            {/* Ring + infos */}
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 10 }}>
              <RingGauge value={gpuUsage} size={72} thickness={7}
                color={colorPct(gpuUsage)} label="GPU" unit="%" />
              <div style={{ flex: 1 }}>
                <Row label="Uso GPU"     value={`${Math.round(gpuUsage)}%`}        color={colorPct(gpuUsage)} />
                <Row label="Temperatura" value={`${Math.round(gpuTemp)}°C`}        color={colorTemp(gpuTemp)} />
                {gpu.vram_total_gb > 0 && <>
                  <Row label="VRAM usada" value={`${gpu.vram_used_gb?.toFixed(1)} GB`} />
                  <Row label="VRAM total" value={`${gpu.vram_total_gb?.toFixed(1)} GB`} />
                </>}
                {gpuDriver && <Row label={t('driver')} value={gpuDriver} />}
                {gpu.power_w != null && <Row label={t('power')} value={`${gpu.power_w} W`} />}
              </div>
            </div>

            {/* Barra de VRAM */}
            {gpu.vram_total_gb > 0 && (
              <div>
                <div style={{ fontSize: 9, color: 'hsl(var(--muted))', marginBottom: 3 }}>
                  VRAM — {gpu.vram_used_gb?.toFixed(1)}/{gpu.vram_total_gb?.toFixed(1)} GB
                </div>
                <div style={{ height: 4, borderRadius: 2, background: 'hsl(var(--border))' }}>
                  <div style={{ height: '100%', borderRadius: 2,
                    width: `${Math.min(100, (gpu.vram_used_gb / gpu.vram_total_gb) * 100)}%`,
                    background: colorPct((gpu.vram_used_gb / gpu.vram_total_gb) * 100),
                    transition: 'width 0.4s' }} />
                </div>
              </div>
            )}
          </Card>
        )}

        {/* CPUs */}
        <Card>
          <CardTitle>
            {cpuBrand === 'intel' && <span style={{ marginRight: 8 }}><IntelLogo /></span>}
            {cpuBrand === 'amd'   && <span style={{ marginRight: 8 }}><AMDLogo /></span>}
            CPU{cpuTemps.length > 1 ? 's' : ''}
          </CardTitle>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {cpuTemps.map(cpu => {
              const sock  = (data.cpu?.sockets ?? []).find(s => s.id === cpu.socket)
              const usage = sock?.usage ?? data.cpu?.usage ?? 0
              const freq  = sock?.freq  ?? data.cpu?.freq  ?? 0
              return (
                <div key={cpu.socket} style={{ flex: '1 1 160px' }}>
                  <div style={{ fontSize: 10, color: 'hsl(var(--muted))', marginBottom: 6 }}>
                    Socket {cpu.socket} · {freq.toFixed(1)} GHz
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
                    <RingGauge value={usage} size={64} thickness={7} color={colorPct(usage)} label="CPU" unit="%" />
                    <div style={{ flex: 1 }}>
                      <Row label="Uso"  value={`${Math.round(usage)}%`}        color={colorPct(usage)} />
                      <Row label="Temp" value={`${Math.round(cpu.package)}°C`} color={colorTemp(cpu.package)} />
                      <Row label={t('freq')} value={`${freq.toFixed(1)} GHz`} />
                    </div>
                  </div>
                  <div style={{ height: 28 }}>
                    <Sparkline data={cpuHistory} height={28} color={colorPct(usage)} />
                  </div>
                </div>
              )
            })}
          </div>
          {procs.filter((p: any) => p.cpu > 0).length > 0 && (
            <>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(var(--muted))', margin: '10px 0 6px' }}>Top CPU</div>
              {procs.filter((p: any) => p.cpu > 0).slice(0, 5).map((p: any, i: number) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <div style={{ flex: 1, fontSize: 11, color: 'hsl(var(--text))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                  <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono', color: colorPct(p.cpu), flexShrink: 0 }}>{p.cpu}%</div>
                </div>
              ))}
            </>
          )}
        </Card>

        {/* Disco */}
        {sysDisk && (
          <Card>
            <CardTitle>{t('systemDisk')}</CardTitle>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 10 }}>
              <RingGauge value={sysDisk.usage} size={72} thickness={7} color={colorPct(sysDisk.usage)} label={sysDisk.usage + '%'} unit="" />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'hsl(var(--text))', marginBottom: 6 }}>
                  {sysDisk.mount}
                </div>
                <Row label="Em uso" value={`${sysDisk.used_gb.toFixed(1)} GB`}                            color={colorPct(sysDisk.usage)} />
                <Row label={t("free")}  value={`${(sysDisk.total_gb - sysDisk.used_gb).toFixed(1)} GB`} />
                <Row label={t("total")}  value={`${sysDisk.total_gb.toFixed(1)} GB`} />
                <Row label={t('type')}   value={(sysDisk.disk_type || '').toUpperCase()} />
              </div>
            </div>
            <div style={{ fontSize: 10, color: 'hsl(var(--muted))', marginTop: 4 }}>
              {sysDisk.device} · {sysDisk.fstype}
            </div>
          </Card>
        )}

        {/* Rede — sempre renderiza o card */}
        <Card>
          <CardTitle>{t('network')}</CardTitle>
          {(!network.adapters || network.adapters.length === 0) ? (
            <div style={{ fontSize: 11, color: 'hsl(var(--muted))', padding: '8px 0' }}>
              Nenhum adaptador detectado
              <div style={{ fontSize: 9, marginTop: 4, fontFamily: 'JetBrains Mono', opacity: 0.6 }}>
                network: {JSON.stringify(network).slice(0, 120)}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {network.adapters.map((adapter: any) => {
                const downColor = adapter.down_mbps > 10 ? 'hsl(var(--red))' : adapter.down_mbps > 1 ? 'hsl(var(--orange))' : 'hsl(var(--accent))'
                const upColor   = adapter.up_mbps   > 10 ? 'hsl(var(--red))' : adapter.up_mbps   > 1 ? 'hsl(var(--orange))' : 'hsl(var(--green))'
                return (
                  <div key={adapter.name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'hsl(var(--text))' }}>{adapter.name}</div>
                      {adapter.ip && <div style={{ fontSize: 9, fontFamily: 'JetBrains Mono', color: 'hsl(var(--muted))' }}>{adapter.ip}</div>}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 4 }}>
                      <div style={{ padding: '8px 10px', borderRadius: 8, background: 'hsl(var(--border) / 0.4)', border: `1px solid ${downColor}33` }}>
                        <div style={{ fontSize: 9, color: 'hsl(var(--muted))', marginBottom: 2 }}>↓ Download</div>
                        <div style={{ fontSize: 14, fontWeight: 800, fontFamily: 'JetBrains Mono', color: downColor }}>{fmtSpeed(adapter.down_mbps)}</div>
                      </div>
                      <div style={{ padding: '8px 10px', borderRadius: 8, background: 'hsl(var(--border) / 0.4)', border: `1px solid ${upColor}33` }}>
                        <div style={{ fontSize: 9, color: 'hsl(var(--muted))', marginBottom: 2 }}>↑ Upload</div>
                        <div style={{ fontSize: 14, fontWeight: 800, fontFamily: 'JetBrains Mono', color: upColor }}>{fmtSpeed(adapter.up_mbps)}</div>
                      </div>
                    </div>
                    {adapter.speed_mb > 0 && (
                      <div style={{ fontSize: 9, color: 'hsl(var(--muted))' }}>
                        Velocidade: {adapter.speed_mb >= 1000 ? `${adapter.speed_mb/1000} Gbps` : `${adapter.speed_mb} Mbps`}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </Card>

      </div>
    </div>
  )
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ fontSize: 9, color: 'hsl(var(--muted))', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'hsl(var(--text))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
    </div>
  )
}
