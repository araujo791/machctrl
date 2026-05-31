import { t, tf, translations, lang } from '../../i18n'
import { useState, useCallback, useRef, useEffect } from 'react'
import { Trash2, RefreshCw, CheckCircle, AlertCircle, Loader } from 'lucide-react'

interface CleanTask {
  id: string
  label: string
  description: string
  needsRoot: boolean
  status: 'idle' | 'running' | 'done' | 'error'
  result?: string
  cleaned?: string
  bytes?: number
}

interface Props {
  sendCommand: (cmd: object) => void
  addMessageListener: (listener: (msg: any) => void) => () => void
}

export function CleanerPanel({ sendCommand, addMessageListener }: Props) {
  const [tasks, setTasks]      = useState<CleanTask[]>([])
  const [loading, setLoading]  = useState(true)
  const [running, setRunning]  = useState(false)
  const [totalBytes, setTotal] = useState(0)
  const abortRef  = useRef(false)
  const resolvers = useRef<Record<string, (r: any) => void>>({})

  // Busca tasks disponíveis do backend
  useEffect(() => {
    const remove = addMessageListener((msg: any) => {
      if (msg.type === 'clean_tasks') {
        setTasks(msg.tasks.map((t: any) => ({ ...t, status: 'idle' as const })))
        setLoading(false)
      }
      if (msg.type === 'clean_task_result' && resolvers.current[msg.task_id]) {
        resolvers.current[msg.task_id](msg)
        delete resolvers.current[msg.task_id]
      }
    })
    // Solicita lista de tasks
    sendCommand({ action: 'get_clean_tasks' })
    return remove
  }, [addMessageListener, sendCommand])

  const update = (id: string, patch: Partial<CleanTask>) =>
    setTasks(ts => ts.map(t => t.id === id ? { ...t, ...patch } : t))

  const execTask = useCallback((taskId: string): Promise<{ bytes: number }> => {
    return new Promise((resolve) => {
      update(taskId, { status: 'running', result: undefined, cleaned: undefined })
      resolvers.current[taskId] = (msg: any) => {
        if (msg.success) {
          update(taskId, { status: 'done', result: msg.result, cleaned: msg.cleaned, bytes: msg.bytes })
        } else {
          update(taskId, { status: 'error', result: msg.result })
        }
        resolve({ bytes: msg.bytes ?? 0 })
      }
      sendCommand({ action: 'run_clean_task', task_id: taskId })
      setTimeout(() => {
        if (resolvers.current[taskId]) {
          delete resolvers.current[taskId]
          update(taskId, { status: 'error', result: t('timeout') })
          resolve({ bytes: 0 })
        }
      }, 30000)
    })
  }, [sendCommand])

  const runAll = useCallback(async () => {
    setRunning(true)
    abortRef.current = false
    setTotal(0)
    setTasks(ts => ts.map(t => ({ ...t, status: 'idle', result: undefined, cleaned: undefined, bytes: undefined })))
    let freed = 0
    for (const task of tasks) {
      if (abortRef.current) break
      const { bytes } = await execTask(task.id)
      freed += bytes
      setTotal(freed)
    }
    setRunning(false)
  }, [execTask, tasks])

  const reset = () => {
    abortRef.current = true
    Object.keys(resolvers.current).forEach(k => delete resolvers.current[k])
    setTasks(ts => ts.map(t => ({ ...t, status: 'idle', result: undefined, cleaned: undefined })))
    setTotal(0)
    setRunning(false)
    // Recarrega lista do backend
    setLoading(true)
    sendCommand({ action: 'get_clean_tasks' })
  }

  const doneCount  = tasks.filter(t => t.status === 'done').length
  const errorCount = tasks.filter(t => t.status === 'error').length
  const progress   = tasks.length > 0 ? Math.round((doneCount + errorCount) / tasks.length * 100) : 0

  const fmtBytes = (b: number) => {
    if (b <= 0) return '0 B'
    if (b >= 1_073_741_824) return `${(b / 1_073_741_824).toFixed(2)} GB`
    if (b >= 1_048_576)     return `${(b / 1_048_576).toFixed(1)} MB`
    if (b >= 1024)          return `${(b / 1024).toFixed(0)} KB`
    return `${b} B`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', height: '100%' }}>

      {/* Header */}
      <div style={{ padding: '16px 18px', borderRadius: 14, background: 'hsl(var(--surface))', border: '1px solid hsl(var(--border))' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: running || doneCount > 0 ? 12 : 0 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'hsl(var(--text))' }}>{t('cleanerTitle')}</div>
            <div style={{ fontSize: 11, color: 'hsl(var(--muted))', marginTop: 2 }}>
              {loading ? t('detectingTools') : tf('tasksAvailable', tasks.length)}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {(running || doneCount > 0) && (
              <Btn onClick={reset} secondary><RefreshCw size={13} /> Resetar</Btn>
            )}
            <Btn onClick={runAll} disabled={running || loading || tasks.length === 0}>
              {running
                ? <><Loader size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> Limpando...</>
                : <><Trash2 size={13} /> {t('cleanAll')}</>}
            </Btn>
          </div>
        </div>

        {(running || doneCount > 0) && tasks.length > 0 && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'hsl(var(--muted))', marginBottom: 4 }}>
              <span>{doneCount}/{tasks.length} concluídas{errorCount > 0 ? ` · ${errorCount} erros` : ''}</span>
              <span>{progress}%</span>
            </div>
            <div style={{ height: 5, borderRadius: 3, background: 'hsl(var(--border))' }}>
              <div style={{ height: '100%', borderRadius: 3, width: `${progress}%`, background: 'hsl(var(--accent))', transition: 'width 0.3s ease', boxShadow: '0 0 8px hsl(var(--accent)/0.5)' }} />
            </div>
          </>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px', color: 'hsl(var(--muted))', fontSize: 13 }}>
          <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid hsl(var(--accent))', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
          {t('detecting')}
        </div>
      )}

      {/* Total liberado */}
      {totalBytes > 0 && (
        <div style={{
          padding: '14px 18px', borderRadius: 14,
          background: 'linear-gradient(135deg, hsl(var(--accent)/0.08), hsl(var(--green)/0.06))',
          border: '1px solid hsl(var(--accent)/0.25)',
        }}>
          <div style={{ fontSize: 11, color: 'hsl(var(--muted))', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('totalFreed')}</div>
          <span style={{ fontSize: 28, fontWeight: 900, fontFamily: 'JetBrains Mono', color: 'hsl(var(--accent))' }}>
            {fmtBytes(totalBytes)}
          </span>
        </div>
      )}

      {/* Lista */}
      {!loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {tasks.map(task => (
            <div key={task.id} style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '12px 16px', borderRadius: 12,
              background: 'hsl(var(--surface))',
              border: `1px solid ${task.status === 'done' ? 'hsl(var(--accent)/0.3)' : task.status === 'error' ? 'hsl(var(--red)/0.3)' : 'hsl(var(--border))'}`,
              transition: 'border-color 0.3s',
            }}>
              <div style={{ width: 22, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
                {task.status === 'idle'    && <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'hsl(var(--border))' }} />}
                {task.status === 'running' && <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid hsl(var(--accent))', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />}
                {task.status === 'done'    && <CheckCircle size={16} color="hsl(var(--accent))" />}
                {task.status === 'error'   && <AlertCircle size={16} color="hsl(var(--red))" />}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'hsl(var(--text))' }}>{(translations[lang] as any)[task.id] ?? task.label}</span>
                  {task.needsRoot && (
                    <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: 'hsl(var(--orange)/0.15)', color: 'hsl(var(--orange))', fontWeight: 600 }}>ROOT</span>
                  )}
                </div>
                <div style={{ fontSize: 10, color: 'hsl(var(--muted))', marginTop: 1 }}>
                  {task.result ?? (translations[lang] as any)[task.id + '-d'] ?? task.description}
                </div>
              </div>

              {task.status === 'done' && task.cleaned && (
                <div style={{
                  padding: '3px 10px', borderRadius: 8, flexShrink: 0,
                  background: 'hsl(var(--accent)/0.1)', border: '1px solid hsl(var(--accent)/0.3)',
                  fontSize: 12, fontWeight: 700, fontFamily: 'JetBrains Mono', color: 'hsl(var(--accent))',
                }}>
                  {task.cleaned}
                </div>
              )}

              {task.status === 'idle' && !running && (
                <button onClick={() => execTask(task.id)} style={{
                  padding: '5px 12px', borderRadius: 8, border: '1px solid hsl(var(--border))',
                  background: 'transparent', color: 'hsl(var(--text))', fontSize: 11,
                  cursor: 'pointer', flexShrink: 0,
                }}>
                  {t('run')}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

function Btn({ children, onClick, disabled, secondary }: any) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '8px 16px', borderRadius: 10, fontSize: 12, fontWeight: 600,
      cursor: disabled ? 'not-allowed' : 'pointer',
      border: secondary ? '1px solid hsl(var(--border))' : '1px solid transparent',
      background: secondary ? 'transparent' : 'hsl(var(--accent))',
      color: secondary ? 'hsl(var(--text))' : '#000',
      opacity: disabled ? 0.5 : 1, transition: 'all 0.15s',
    }}>
      {children}
    </button>
  )
}
