import { useState, useCallback, useRef } from 'react'
import { Trash2, RefreshCw, CheckCircle, AlertCircle, Loader } from 'lucide-react'

interface CleanTask {
  id: string
  label: string
  description: string
  needsRoot: boolean
  status: 'idle' | 'running' | 'done' | 'error' | 'skipped'
  result?: string
  cleaned?: string
  bytes?: number
}

const TASKS: Omit<CleanTask, 'status'>[] = [
  { id: 'pacman-cache',   label: 'Cache do Pacman',       description: 'Remove pacotes antigos (/var/cache/pacman/pkg)', needsRoot: true },
  { id: 'pacman-orphans', label: 'Pacotes Órfãos',        description: 'Remove pacotes sem dependentes instalados',      needsRoot: true },
  { id: 'journal-logs',   label: 'Logs do Journal',       description: 'Limpa logs do systemd (mantém últimos 7 dias)',  needsRoot: true },
  { id: 'temp-files',     label: 'Arquivos Temporários',  description: 'Remove arquivos antigos de /tmp e /var/tmp',    needsRoot: true },
  { id: 'thumb-cache',    label: 'Cache de Miniaturas',   description: 'Limpa thumbnails do usuário (~/.cache)',         needsRoot: false },
  { id: 'coredumps',      label: 'Core Dumps',            description: 'Remove arquivos de crash dump do sistema',      needsRoot: true },
  { id: 'pip-cache',      label: 'Cache do Pip',          description: 'Limpa cache de pacotes Python',                 needsRoot: false },
  { id: 'npm-cache',      label: 'Cache do npm',          description: 'Limpa cache de pacotes Node.js',               needsRoot: false },
  { id: 'trash',          label: 'Lixeira',               description: 'Esvazia a lixeira do usuário (~/.local/share/Trash)', needsRoot: false },
]

export function CleanerPanel() {
  const [tasks, setTasks] = useState<CleanTask[]>(
    TASKS.map(t => ({ ...t, status: 'idle' as const }))
  )
  const [running, setRunning]    = useState(false)
  const [totalBytes, setTotal]   = useState(0)
  const abortRef = useRef(false)
  const wsRef    = useRef<WebSocket | null>(null)

  const update = (id: string, patch: Partial<CleanTask>) =>
    setTasks(ts => ts.map(t => t.id === id ? { ...t, ...patch } : t))

  // Executa tarefa via WebSocket e aguarda resposta
  const execTask = useCallback((taskId: string): Promise<{ cleaned: string; bytes: number }> => {
    return new Promise((resolve) => {
      const ws = wsRef.current
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        update(taskId, { status: 'error', result: 'Backend desconectado' })
        resolve({ cleaned: '—', bytes: 0 })
        return
      }

      const handler = (e: MessageEvent) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.type === 'clean_task_result' && msg.task_id === taskId) {
            ws.removeEventListener('message', handler)
            if (msg.success) {
              update(taskId, { status: 'done', result: msg.result, cleaned: msg.cleaned, bytes: msg.bytes })
            } else {
              update(taskId, { status: 'error', result: msg.result })
            }
            resolve({ cleaned: msg.cleaned ?? '—', bytes: msg.bytes ?? 0 })
          }
        } catch {}
      }

      ws.addEventListener('message', handler)
      update(taskId, { status: 'running', result: undefined, cleaned: undefined })
      ws.send(JSON.stringify({ action: 'run_clean_task', task_id: taskId }))

      // Timeout de 30s por tarefa
      setTimeout(() => {
        ws.removeEventListener('message', handler)
        update(taskId, { status: 'error', result: 'Timeout' })
        resolve({ cleaned: '—', bytes: 0 })
      }, 30000)
    })
  }, [])

  // Conecta ao backend ao montar
  const initWs = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return
    const ws = new WebSocket('ws://127.0.0.1:9001')
    wsRef.current = ws
  }, [])

  const runAll = useCallback(async () => {
    initWs()
    // Aguarda conexão
    await new Promise<void>(r => {
      if (wsRef.current?.readyState === WebSocket.OPEN) { r(); return }
      const check = setInterval(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) { clearInterval(check); r() }
      }, 100)
      setTimeout(() => { clearInterval(check); r() }, 3000)
    })

    setRunning(true)
    abortRef.current = false
    setTotal(0)
    setTasks(ts => ts.map(t => ({ ...t, status: 'idle', result: undefined, cleaned: undefined, bytes: undefined })))

    let freed = 0
    for (const task of TASKS) {
      if (abortRef.current) break
      const { bytes } = await execTask(task.id)
      freed += bytes ?? 0
    }
    setTotal(freed)
    setRunning(false)
  }, [execTask, initWs])

  const runSingle = useCallback(async (taskId: string) => {
    initWs()
    await new Promise<void>(r => {
      if (wsRef.current?.readyState === WebSocket.OPEN) { r(); return }
      const check = setInterval(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) { clearInterval(check); r() }
      }, 100)
      setTimeout(() => { clearInterval(check); r() }, 3000)
    })
    await execTask(taskId)
  }, [execTask, initWs])

  const reset = () => {
    abortRef.current = true
    setTasks(ts => ts.map(t => ({ ...t, status: 'idle', result: undefined, cleaned: undefined })))
    setTotal(0)
    setRunning(false)
  }

  const doneCount  = tasks.filter(t => t.status === 'done').length
  const errorCount = tasks.filter(t => t.status === 'error').length
  const progress   = Math.round((doneCount + errorCount) / tasks.length * 100)

  const fmtBytes = (b: number) => {
    if (b <= 0) return '0 B'
    if (b >= 1_073_741_824) return `${(b/1_073_741_824).toFixed(2)} GB`
    if (b >= 1_048_576)     return `${(b/1_048_576).toFixed(1)} MB`
    if (b >= 1024)          return `${(b/1024).toFixed(0)} KB`
    return `${b} B`
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16, overflowY:'auto', height:'100%' }}>

      {/* Header */}
      <div style={{ padding:'16px 18px', borderRadius:14, background:'hsl(var(--surface))', border:'1px solid hsl(var(--border))' }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom: running || doneCount > 0 ? 12 : 0 }}>
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:'hsl(var(--text))' }}>Limpeza do Sistema</div>
            <div style={{ fontSize:11, color:'hsl(var(--muted))', marginTop:2 }}>
              Remove caches, logs, lixeira e pacotes desnecessários
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

      {/* Total liberado */}
      {totalBytes > 0 && !running && (
        <div style={{
          padding:'14px 18px', borderRadius:14,
          background:'linear-gradient(135deg, hsl(var(--accent)/0.08), hsl(var(--green)/0.06))',
          border:'1px solid hsl(var(--accent)/0.25)',
        }}>
          <div style={{ fontSize:11, color:'hsl(var(--muted))', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.06em' }}>
            Total Liberado
          </div>
          <span style={{ fontSize:28, fontWeight:900, fontFamily:'JetBrains Mono', color:'hsl(var(--accent))' }}>
            {fmtBytes(totalBytes)}
          </span>
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
            <div style={{ width:22, display:'flex', justifyContent:'center', flexShrink:0 }}>
              {task.status==='idle'    && <div style={{ width:8, height:8, borderRadius:'50%', background:'hsl(var(--border))' }} />}
              {task.status==='running' && <div style={{ width:16, height:16, borderRadius:'50%', border:'2px solid hsl(var(--accent))', borderTopColor:'transparent', animation:'spin 0.8s linear infinite' }} />}
              {task.status==='done'    && <CheckCircle size={16} color="hsl(var(--accent))" />}
              {task.status==='error'   && <AlertCircle size={16} color="hsl(var(--red))" />}
            </div>

            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <span style={{ fontSize:13, fontWeight:600, color:'hsl(var(--text))' }}>{task.label}</span>
                {task.needsRoot && (
                  <span style={{ fontSize:9, padding:'1px 5px', borderRadius:4, background:'hsl(var(--orange)/0.15)', color:'hsl(var(--orange))', fontWeight:600 }}>ROOT</span>
                )}
              </div>
              <div style={{ fontSize:10, color:'hsl(var(--muted))', marginTop:1 }}>
                {task.result ?? task.description}
              </div>
            </div>

            {task.status==='done' && task.cleaned && (
              <div style={{
                padding:'3px 10px', borderRadius:8, flexShrink:0,
                background:'hsl(var(--accent)/0.1)',
                border:'1px solid hsl(var(--accent)/0.3)',
                fontSize:12, fontWeight:700, fontFamily:'JetBrains Mono',
                color:'hsl(var(--accent))',
              }}>
                {task.cleaned}
              </div>
            )}

            {task.status==='idle' && !running && (
              <button onClick={() => runSingle(task.id)} style={{
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
