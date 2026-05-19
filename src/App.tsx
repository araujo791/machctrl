import { useEffect } from 'react'
import { Sidebar, type Tab } from './components/sidebar/Sidebar'
import { Titlebar } from './components/sidebar/Titlebar'
import { OverviewPanel } from './components/panels/OverviewPanel'
import { CpuPanel } from './components/panels/CpuPanel'
import { MemoryPanel } from './components/panels/MemoryPanel'
import { DisksPanel } from './components/panels/DisksPanel'
import { FansPanel } from './components/panels/FansPanel'
import { PowerPanel } from './components/panels/PowerPanel'
import { CleanerPanel } from './components/panels/CleanerPanel'
import { BenchmarkPanel } from './components/benchmark/BenchmarkPanel'
import { useSensorData } from './hooks/useSensorData'
import { useTheme } from './hooks/useTheme'
import { useState } from 'react'
import appIconUrl from './assets/app-icon.png'

const PAGE_TITLES: Record<Tab, string> = {
  overview:'Visão Geral', cpu:'CPU', memory:'Memória', disks:'Discos',
  fans:'Fans', power:'Perfil de Energia', cleaner:'Limpeza',
  benchmark:'Benchmark', about:'Sobre',
}

export function App() {
  const [tab, setTab] = useState<Tab>('overview')
  const { state, data, history, tempHistory, sendCommand } = useSensorData()
  const { theme, toggle } = useTheme()
  const connected = state === 'connected'

  // Aplica tema ao body
  useEffect(() => {
    document.body.style.background = 'hsl(var(--bg))'
  }, [theme])

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', overflow:'hidden', background:'hsl(var(--bg))' }}>
      <Titlebar connected={connected} theme={theme} onToggleTheme={toggle} />

      <div style={{ display:'flex', flex:1, overflow:'hidden' }}>
        <Sidebar active={tab} onChange={setTab} />

        <main style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', padding:'14px 18px' }}>
          {/* Page header */}
          <div style={{ marginBottom:14, flexShrink:0 }}>
            <h1 style={{ fontSize:20, fontWeight:800, color:'hsl(var(--text))', letterSpacing:'-0.02em', lineHeight:1 }}>
              {PAGE_TITLES[tab]}
            </h1>
            {data?.system && (
              <p style={{ fontSize:11, color:'hsl(var(--muted))', marginTop:3 }}>
                {(data.system as any).hostname} · {(data.system as any).os} · Uptime {(data.system as any).uptime}
              </p>
            )}
          </div>

          {/* Content */}
          <div style={{ flex:1, overflow:'hidden' }}>
            {!data && <LoadingState state={state} />}
            {data && tab==='overview'  && <OverviewPanel data={data} cpuHistory={history} tempHistory={tempHistory} />}
            {data && tab==='cpu'       && <CpuPanel      data={data} cpuHistory={history} />}
            {data && tab==='memory'    && <MemoryPanel   data={data} />}
            {data && tab==='disks'     && <DisksPanel    data={data} />}
            {data && tab==='fans'      && <FansPanel     data={data} onCommand={sendCommand} />}
            {data && tab==='power'     && <div style={{overflowY:'auto',height:'100%',paddingTop:4}}><PowerPanel data={data} onCommand={sendCommand} /></div>}
            {tab==='cleaner'           && <CleanerPanel />}
            {tab==='benchmark'         && <BenchmarkPanel />}
            {tab==='about'             && <AboutPanel theme={theme} onToggleTheme={toggle} />}
          </div>
        </main>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

function LoadingState({ state }: { state: string }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:14 }}>
      <div style={{ width:44, height:44, borderRadius:'50%', border:'3px solid hsl(var(--border))', borderTopColor:'hsl(var(--accent))', animation:'spin 0.9s linear infinite' }} />
      <div style={{ fontSize:13, color:'hsl(var(--muted))' }}>
        {state==='connecting'?'Conectando ao backend...' : state==='error'?'Erro — tentando reconectar...' : 'Backend desconectado'}
      </div>
      <button onClick={() => window.electron?.restartBackend()} style={{ fontSize:11, padding:'6px 14px', borderRadius:8, cursor:'pointer', border:'1px solid hsl(var(--border))', background:'transparent', color:'hsl(var(--muted))' }}>
        Reiniciar Backend
      </button>
    </div>
  )
}

function AboutPanel({ theme, onToggleTheme }: { theme: string; onToggleTheme: () => void }) {
  const handleAutostart = async () => {
    try {
      await window.electron?.setAutostart(true)
      alert('MachCtrl configurado para iniciar com o sistema!')
    } catch { alert('Configure manualmente: copie machctrl.desktop para ~/.config/autostart/') }
  }

  const handleDonate = () => {
    const email = 'anderson.henrique.araujo@hotmail.com'
    const url = `https://www.paypal.com/donate/?business=${encodeURIComponent(email)}&currency_code=BRL&item_name=MachCtrl`
    // Tenta electron shell, fallback para window.open
    if (window.electron?.openExternal) {
      window.electron.openExternal(url)
    } else {
      window.open(url, '_blank')
    }
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:20 }}>
      <img
        src={appIconUrl}
        alt="MachCtrl"
        style={{ width:100, height:100, borderRadius:24, objectFit:'contain',
          boxShadow:'0 12px 40px hsl(217 100% 62% / 0.3)' }}
      />
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:26, fontWeight:900, color:'hsl(var(--text))' }}>MachCtrl</div>
        <div style={{ fontSize:13, color:'hsl(var(--muted))', marginTop:4 }}>Monitor e Otimizador de Hardware para Linux</div>
        <div style={{ display:'inline-flex', alignItems:'center', gap:8, marginTop:8, padding:'3px 14px', borderRadius:20, background:'hsl(var(--surface))', border:'1px solid hsl(var(--border))', fontSize:11, color:'hsl(var(--muted))' }}>
          v2.0.0 · CachyOS / Arch · Electron + React
        </div>
      </div>

      <div style={{ display:'flex', gap:10, flexWrap:'wrap', justifyContent:'center' }}>
        <ActionBtn onClick={onToggleTheme} label={theme==='dark' ? '☀️  Tema Claro' : '🌙  Tema Escuro'} />
        <ActionBtn onClick={handleAutostart} label="🚀  Iniciar com o sistema" />
        <ActionBtn
          onClick={handleDonate}
          label="💙  Apoiar via PayPal"
          accent
        />
      </div>

      <div style={{ fontSize:11, color:'hsl(var(--muted))', opacity:0.5, textAlign:'center', maxWidth:320 }}>
        Se o MachCtrl te ajuda, considere apoiar o desenvolvimento ❤️
      </div>
    </div>
  )
}

function ActionBtn({ onClick, label, accent }: { onClick: () => void; label: string; accent?: boolean }) {
  return (
    <button onClick={onClick} style={{
      fontSize:12, padding:'9px 22px', borderRadius:10, cursor:'pointer',
      border: accent ? '1px solid hsl(217 100% 62% / 0.5)' : '1px solid hsl(var(--border))',
      background: accent ? 'hsl(217 100% 62% / 0.12)' : 'hsl(var(--surface))',
      color: accent ? 'hsl(var(--accent))' : 'hsl(var(--text))',
      fontWeight: accent ? 700 : 400,
      transition:'all 0.15s',
    }}>
      {label}
    </button>
  )
}
