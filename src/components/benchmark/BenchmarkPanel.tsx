import { useState, useRef, useCallback } from 'react'
import { Play, Square, Award, Cpu, MemoryStick, HardDrive } from 'lucide-react'

interface BenchResult {
  name: string
  score: number
  unit: string
  detail?: string
  rating?: 'poor' | 'ok' | 'good' | 'great'
}

type BenchState = 'idle' | 'running' | 'done'

// ── CPU benchmark: math-heavy operations in JS ──────────────────────────────
function runCpuBench(): Promise<BenchResult> {
  return new Promise(resolve => {
    setTimeout(() => {
      const start = performance.now()
      let n = 0
      // Sieve of Eratosthenes up to 1M
      const limit = 1_000_000
      const sieve = new Uint8Array(limit + 1)
      sieve.fill(1)
      sieve[0] = sieve[1] = 0
      for (let i = 2; i * i <= limit; i++) {
        if (sieve[i]) for (let j = i * i; j <= limit; j += i) sieve[j] = 0
      }
      for (let i = 0; i <= limit; i++) if (sieve[i]) n++
      const elapsed = performance.now() - start
      const score = Math.round(100_000 / elapsed * 10) / 10
      resolve({
        name: 'CPU (Crivo de Eratóstenes)',
        score, unit: 'pts/ms',
        detail: `${n.toLocaleString()} primos em ${elapsed.toFixed(0)}ms`,
        rating: score > 40 ? 'great' : score > 20 ? 'good' : score > 10 ? 'ok' : 'poor',
      })
    }, 50)
  })
}

// ── Memory bandwidth bench ────────────────────────────────────────────────────
function runMemBench(): Promise<BenchResult> {
  return new Promise(resolve => {
    setTimeout(() => {
      const size = 64 * 1024 * 1024 // 64 MB
      const buf = new Float64Array(size / 8)
      const start = performance.now()
      for (let i = 0; i < buf.length; i++) buf[i] = i * 1.0000001
      let sum = 0
      for (let i = 0; i < buf.length; i++) sum += buf[i]
      const elapsed = performance.now() - start
      const bw = Math.round((size * 2) / elapsed / 1024 / 1024 * 1000) // MB/s
      resolve({
        name: 'Memória (Largura de Banda)',
        score: bw, unit: 'MB/s',
        detail: `${(size / 1024 / 1024).toFixed(0)}MB R+W em ${elapsed.toFixed(0)}ms · checksum: ${(sum % 9999).toFixed(0)}`,
        rating: bw > 20000 ? 'great' : bw > 10000 ? 'good' : bw > 5000 ? 'ok' : 'poor',
      })
    }, 50)
  })
}

// ── Floating point bench ──────────────────────────────────────────────────────
function runFpBench(): Promise<BenchResult> {
  return new Promise(resolve => {
    setTimeout(() => {
      const start = performance.now()
      let acc = 0
      for (let i = 1; i <= 10_000_000; i++) {
        acc += Math.sqrt(i) * Math.log(i) / Math.sin(i + 0.01)
      }
      const elapsed = performance.now() - start
      const score = Math.round(10_000_000 / elapsed)
      resolve({
        name: 'CPU Ponto Flutuante',
        score, unit: 'ops/ms',
        detail: `10M sqrt/log/sin em ${elapsed.toFixed(0)}ms · acc=${acc.toExponential(2)}`,
        rating: score > 200 ? 'great' : score > 100 ? 'good' : score > 50 ? 'ok' : 'poor',
      })
    }, 50)
  })
}

const RATING_COLOR: Record<string, string> = {
  great: 'hsl(var(--green))',
  good:  'hsl(var(--accent))',
  ok:    'hsl(var(--orange))',
  poor:  'hsl(var(--red))',
}
const RATING_LABEL: Record<string, string> = {
  great: 'Excelente', good: 'Bom', ok: 'Regular', poor: 'Fraco'
}

export function BenchmarkPanel() {
  const [state, setState]     = useState<BenchState>('idle')
  const [results, setResults] = useState<BenchResult[]>([])
  const [current, setCurrent] = useState('')
  const [progress, setProgress] = useState(0)
  const abortRef = useRef(false)

  const run = useCallback(async () => {
    setState('running')
    abortRef.current = false
    setResults([])

    const steps = [
      { label: 'CPU — Crivo de Eratóstenes', fn: runCpuBench },
      { label: 'CPU — Ponto Flutuante', fn: runFpBench },
      { label: 'Memória — Largura de Banda', fn: runMemBench },
    ]

    const out: BenchResult[] = []
    for (let i = 0; i < steps.length; i++) {
      if (abortRef.current) break
      setCurrent(steps[i].label)
      setProgress(Math.round(i / steps.length * 100))
      const r = await steps[i].fn()
      out.push(r)
      setResults([...out])
    }
    setCurrent('')
    setProgress(100)
    setState('done')
  }, [])

  const stop = () => { abortRef.current = true; setState('idle'); setCurrent('') }
  const reset = () => { setResults([]); setState('idle'); setProgress(0) }

  const overallScore = results.length
    ? Math.round(results.reduce((s, r) => {
        const norm = r.unit === 'pts/ms' ? r.score * 10 :
                     r.unit === 'ops/ms' ? r.score / 5 :
                     r.score / 100
        return s + norm
      }, 0) / results.length)
    : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', height: '100%' }}>

      {/* Header */}
      <div style={{
        padding: '16px 18px', borderRadius: 14,
        background: 'hsl(var(--surface))',
        border: '1px solid hsl(var(--border))',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'hsl(var(--text))' }}>Benchmark do Sistema</div>
            <div style={{ fontSize: 11, color: 'hsl(var(--muted))', marginTop: 2 }}>
              Testa CPU (matemática + ponto flutuante) e largura de banda da memória
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {state === 'running' ? (
              <Btn onClick={stop} danger><Square size={13} /> Parar</Btn>
            ) : (
              <>
                {results.length > 0 && <Btn onClick={reset} secondary>Resetar</Btn>}
                <Btn onClick={run}><Play size={13} /> Iniciar</Btn>
              </>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {state === 'running' && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'hsl(var(--muted))', marginBottom: 4 }}>
              <span>{current}</span><span>{progress}%</span>
            </div>
            <div style={{ height: 4, borderRadius: 2, background: 'hsl(var(--border))' }}>
              <div style={{ height: '100%', borderRadius: 2, width: `${progress}%`,
                background: 'hsl(var(--accent))', transition: 'width 0.3s ease',
                boxShadow: '0 0 10px hsl(var(--accent) / 0.5)' }} />
            </div>
          </div>
        )}
      </div>

      {/* Overall score */}
      {state === 'done' && overallScore != null && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 20, padding: '20px 24px',
          borderRadius: 16,
          background: 'linear-gradient(135deg, hsl(217 100% 62% / 0.08), hsl(262 80% 65% / 0.08))',
          border: '1px solid hsl(217 100% 62% / 0.2)',
        }}>
          <Award size={40} color="hsl(var(--accent))" />
          <div>
            <div style={{ fontSize: 11, color: 'hsl(var(--muted))', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Pontuação Geral
            </div>
            <div style={{ fontSize: 48, fontWeight: 900, fontFamily: 'JetBrains Mono',
              background: 'linear-gradient(135deg, hsl(217 100% 70%), hsl(262 80% 70%))',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              {overallScore.toLocaleString()}
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {results.map((r, i) => (
            <div key={i} style={{
              padding: '14px 16px', borderRadius: 12,
              background: 'hsl(var(--surface))',
              border: `1px solid ${r.rating ? RATING_COLOR[r.rating] + '44' : 'hsl(var(--border))'}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'hsl(var(--text))' }}>{r.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {r.rating && (
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
                      background: RATING_COLOR[r.rating] + '22',
                      color: RATING_COLOR[r.rating],
                    }}>
                      {RATING_LABEL[r.rating]}
                    </span>
                  )}
                  <span style={{ fontSize: 20, fontWeight: 800, fontFamily: 'JetBrains Mono',
                    color: r.rating ? RATING_COLOR[r.rating] : 'hsl(var(--accent))' }}>
                    {r.score.toLocaleString()}
                    <span style={{ fontSize: 11, fontWeight: 400, color: 'hsl(var(--muted))', marginLeft: 3 }}>
                      {r.unit}
                    </span>
                  </span>
                </div>
              </div>
              {r.detail && (
                <div style={{ fontSize: 10, color: 'hsl(var(--muted))', fontFamily: 'JetBrains Mono' }}>
                  {r.detail}
                </div>
              )}
              {/* Score bar */}
              <div style={{ marginTop: 8, height: 3, borderRadius: 2, background: 'hsl(var(--border))' }}>
                <div style={{
                  height: '100%', borderRadius: 2,
                  width: `${Math.min(100, r.rating === 'great' ? 100 : r.rating === 'good' ? 75 : r.rating === 'ok' ? 50 : 25)}%`,
                  background: r.rating ? RATING_COLOR[r.rating] : 'hsl(var(--accent))',
                  transition: 'width 0.6s ease',
                }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {state === 'idle' && results.length === 0 && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
          padding: 40, color: 'hsl(var(--muted))', textAlign: 'center',
        }}>
          <div style={{ display: 'flex', gap: 16 }}>
            <Cpu size={28} color="hsl(var(--accent))" />
            <MemoryStick size={28} color="hsl(var(--purple))" />
            <HardDrive size={28} color="hsl(var(--green))" />
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'hsl(var(--text))' }}>Pronto para Benchmark</div>
          <div style={{ fontSize: 12 }}>Clique em Iniciar para rodar os testes de CPU e Memória</div>
        </div>
      )}
    </div>
  )
}

function Btn({ children, onClick, secondary, danger }: any) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '8px 16px', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer',
      border: secondary ? '1px solid hsl(var(--border))' : '1px solid transparent',
      background: danger ? 'hsl(var(--red) / 0.15)' : secondary ? 'transparent' : 'hsl(var(--accent))',
      color: danger ? 'hsl(var(--red))' : secondary ? 'hsl(var(--text))' : '#000',
      transition: 'all 0.15s',
    }}>
      {children}
    </button>
  )
}
