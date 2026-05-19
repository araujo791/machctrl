import { useState, useCallback, useRef } from 'react'
import { Trash2, RefreshCw, CheckCircle, AlertCircle, Loader } from 'lucide-react'

interface CleanTask {
  id: string
  label: string
  description: string
  status: 'idle' | 'running' | 'done' | 'error'
  result?: string
  cleaned?: string   // ex: "342 MB" ou "12 arquivos"
}

const TASKS: Omit<CleanTask, 'status'>[] = [
  { id: 'pacman-cache',   label: 'Cache do Pacman',       description: 'Remove pacotes antigos (/var/cache/pacman/pkg)' },
  { id: 'pacman-orphans', label: 'Pacotes Órfãos',        description: 'Remove pacotes sem dependentes instalados' },
  { id: 'journal-logs',  label: 'Logs do Journal',        description: 'Limpa logs do systemd (mantém últimos 7 dias)' },
  { id: 'temp-files',    label: 'Arquivos Temporários',   description: 'Remove arquivos antigos de /tmp e /var/tmp' },
  { id: 'thumb-cache',   label: 'Cache de Miniaturas',    description: 'Limpa thumbnails do usuário (~/.cache/thumbnails)' },
  { id: 'coredumps',     label: 'Core Dumps',             description: 'Remove arquivos de crash dump do sistema' },
  { id: 'pip-cache',     label: 'Cache do Pip',           description: 'Limpa cache de pacotes Python' },
  { id: 'npm-cache',     label: 'Cache do npm',           description: 'Limpa cache de pacotes Node.js' },
]

// Simula execução e retorna resultado com quantidade limpa
async function runTask(id: string): Promise<{ result: string; cleaned: string }> {
  await new Promise(r => setTimeout(r, 600 + Math.random() * 800))
  const fakeResults: Record<string, { result: string; cleaned: string }> = {
    'pacman-cache':   { result: 'Cache limpo com sucesso', cleaned: `${(Math.random()*800+100).toFixed(0)} MB` },
    'pacman-orphans': { result: 'Órfãos removidos',        cleaned: `${Math.floor(Math.random()*8)} pacotes` },
    'journal-logs':   { result: 'Logs compactados',        cleaned: `${(Math.random()*200+20).toFixed(0)} MB` },
    'temp-files':     { result: 'Temp limpos',             cleaned: `${Math.floor(Math.random()*200+10)} arquivos` },
    'thumb-cache':    { result: 'Miniaturas removidas',    cleaned: `${(Math.random()*50+5).toFixed(0)} MB` },
    'coredumps':      { result: 'Core dumps removidos',    cleaned: `${Math.floor(Math.random()*3)} arquivos` },
    'pip-cache':      { result: 'Cache pip limpo',         cleaned: `${(Math.random()*150+10).toFixed(0)} MB` },
    'npm-cache':      { result: 'Cache npm limpo',         cleaned: `${(Math.random()*300+50).toFixed(0)} MB` },
  }
  return fakeResults[id] ?? { result: 'Concluído', cleaned: '—' }
}

export function CleanerPanel() {
  const [tasks, setTasks] = useState<CleanTask[]>(
    TASKS.map(t => ({ ...t, status: 'idle' as const }))
  )
  const [running, setRunning]     = useState(false)
  const [totalCleaned, setTotal]  = useState<string[]>([])
  const abortRef = useRef(false)

  const update = (id: string, patch: Partial<CleanTask>) =>
    setTasks(ts => ts.map(t => t.id === id ? { ...t, ...patch } : t))

  const execTask = useCallback(async (task: CleanTask) => {
    update(task.id, { status: 'running', result: undefined, cleaned: undefined })
    try {
      const { result, cleaned } = await runTask(task.id)
      update(task.id, { status: 'done', result, cleaned })
      return cleaned
    } catch (e: any) {
      update(task.id, { status: 'error', result: e.message })
      return null
    }
  }, [])

  const runAll = useCallback(async () => {
    setRunning(true)
    abortRef.current = false
    setTotal([])
    setTasks(ts => ts.map(t => ({ ...t, status: 'idle', result: undefined, cleaned: undefined })))

    const cleaned: string[] = []
    for (const task of tasks) {
      if (abortRef.current) break
      const r = await execTask(task)
      if (r) cleaned.push(r)
    }
    setTotal(cleaned)
    setRunning(false)
  }, [tasks, execTask])

  const reset = () => {
    abortRef.current = true
    setTasks(ts => ts.map(t => ({ ...t, status: 'idle', result: undefined, cleaned: undefined })))
    setTotal([])
    setRunning(false)
  }

  const doneCount   = tasks.filter(t => t.status === 'done').length
  const errorCount  = tasks.filter(t => t.status === 'error').length
  const progress    = Math.round((doneCount + errorCount) / tasks.length * 100)

  // Soma MB limpas
  const totalMB = totalCleaned
    .filter(s => s.includes('MB'))
    .reduce((acc, s) => acc + parseFloat(s), 0)

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16, overflowY:'auto', height:'100%' }}>

      {/* Header */}
      <div style={{ padding:'16px 18px', borderRadius:14, background:'hsl(var(--surface))', border:'1px solid hsl(var(--border))' }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom: running || doneCount > 0 ? 12 : 0 }}>
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:'hsl(var(--text))' }}>Limpeza do Sistema</div>
            <div style={{ fontSize:11, color:'hsl(var(--muted))', marginTop:2 }}>
              Remove caches, logs e pacotes desnecessários
            </div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            {(running || doneCount > 0) && (
              <Btn onClick={reset} secondary>
                <RefreshCw size={13} /> Resetar
              </Btn>
            )}
            <Btn onClick={runAll} disabled={running}>
              {running
                ? <><Loader size={13} style={{ animation:'spin 0.8s linear infinite' }} /> Limpando...</>
                : <><Trash2 size={13} /> Limpar Tudo</>
              }
            </Btn>
          </div>
        </div>

        {/* Progresso */}
        {(running || doneCount > 0) && (
          <>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'hsl(var(--muted))', marginBottom:4 }}>
              <span>{doneCount}/{tasks.length} concluídas{errorCount > 0 ? ` · ${errorCount} erros` : ''}</span>
              <span>{progress}%</span>
            </div>
            <div style={{ height:5, borderRadius:3, background:'hsl(var(--border))' }}>
              <div style={{ height:'100%', borderRadius:3, width:`${progress}%`, background:'hsl(var(--accent))', transition:'width 0.3s ease', boxShadow:'0 0 8px hsl(var(--accent)/0.5)' }} />
            </div>
          </>
        )}
      </div>

      {/* Resultado total */}
      {totalCleaned.length > 0 && !running && (
        <div style={{
          padding:'14px 18px', borderRadius:14,
          background:'linear-gradient(135deg, hsl(var(--accent)/0.08), hsl(var(--green)/0.06))',
          border:'1px solid hsl(var(--accent)/0.25)',
        }}>
          <div style={{ fontSize:11, color:'hsl(var(--muted))', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.06em' }}>
            Total Liberado
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:'6px 16px' }}>
            {totalMB > 0 && (
              <span style={{ fontSize:22, fontWeight:900, fontFamily:'JetBrains Mono', color:'hsl(var(--accent))' }}>
                {totalMB >= 1024
                  ? `${(totalMB/1024).toFixed(2)} GB`
                  : `${totalMB.toFixed(0)} MB`
                }
              </span>
            )}
            {tasks.filter(t=>t.cleaned && !t.cleaned.includes('MB')).map(t => (
              <span key={t.id} style={{ fontSize:13, fontFamily:'JetBrains Mono', color:'hsl(var(--green))' }}>
                {t.cleaned} ({t.label})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Lista de tarefas */}
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {tasks.map(task => (
          <div key={task.id} style={{
            display:'flex', alignItems:'center', gap:14,
            padding:'12px 16px', borderRadius:12,
            background:'hsl(var(--surface))',
            border:`1px solid ${
              task.status==='done'  ? 'hsl(var(--accent)/0.3)' :
              task.status==='error' ? 'hsl(var(--red)/0.3)'    :
              'hsl(var(--border))'
            }`,
            transition:'border-color 0.3s',
          }}>
            {/* Ícone status */}
            <div style={{ width:22, display:'flex', justifyContent:'center', flexShrink:0 }}>
              {task.status==='idle'    && <div style={{ width:8, height:8, borderRadius:'50%', background:'hsl(var(--border))' }} />}
              {task.status==='running' && <div style={{ width:16, height:16, borderRadius:'50%', border:'2px solid hsl(var(--accent))', borderTopColor:'transparent', animation:'spin 0.8s linear infinite' }} />}
              {task.status==='done'    && <CheckCircle size={16} color="hsl(var(--accent))" />}
              {task.status==='error'   && <AlertCircle size={16} color="hsl(var(--red))" />}
            </div>

            {/* Info */}
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:13, fontWeight:600, color:'hsl(var(--text))' }}>{task.label}</div>
              <div style={{ fontSize:10, color:'hsl(var(--muted))', marginTop:1 }}>
                {task.result ?? task.description}
              </div>
            </div>

            {/* Quantidade limpa */}
            {task.status==='done' && task.cleaned && (
              <div style={{
                padding:'3px 10px', borderRadius:8, flexShrink:0,
                background:'hsl(var(--accent)/0.1)',
                border:'1px solid hsl(var(--accent)/0.3)',
                fontSize:12, fontWeight:700,
                fontFamily:'JetBrains Mono',
                color:'hsl(var(--accent))',
              }}>
                {task.cleaned}
              </div>
            )}

            {/* Botão individual */}
            {task.status==='idle' && !running && (
              <button onClick={() => execTask(task)} style={{
                padding:'5px 12px', borderRadius:8, border:'1px solid hsl(var(--border))',
                background:'transparent', color:'hsl(var(--text))', fontSize:11,
                cursor:'pointer', flexShrink:0,
              }}>
                Executar
              </button>
            )}
          </div>
        ))}
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

function Btn({ children, onClick, disabled, secondary }: any) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      display:'flex', alignItems:'center', gap:6,
      padding:'8px 16px', borderRadius:10, fontSize:12, fontWeight:600,
      cursor: disabled ? 'not-allowed' : 'pointer',
      border: secondary ? '1px solid hsl(var(--border))' : '1px solid transparent',
      background: secondary ? 'transparent' : 'hsl(var(--accent))',
      color: secondary ? 'hsl(var(--text))' : '#000',
      opacity: disabled ? 0.5 : 1, transition:'all 0.15s',
    }}>
      {children}
    </button>
  )
}
