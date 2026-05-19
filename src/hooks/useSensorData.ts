import { useEffect, useRef, useState, useCallback } from 'react'

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error'

export interface SensorData {
  temperatures: Record<string, number>
  cpus_temps: Array<{
    socket: number
    package: number
    cores: Array<{ id: number; temp: number; usage: number }>
  }>
  cpu: {
    usage: number
    freq: number
    model: string
    sockets: Array<{ id: number; model: string; usage: number; freq: number; core_count: number; thread_count: number }>
  }
  memory: {
    usage: number
    total_gb: number
    used_gb: number
    total_slots: number
    occupied_slots: number
    slots: Array<{
      locator: string
      bank: string
      size_gb: number
      type: string
      speed_mhz: number
      configured_speed_mhz: number
      voltage: number
      manufacturer: string
      part_number: string
    }>
  }
  disks: Array<{
    device: string
    mount: string
    fstype: string
    total_gb: number
    used_gb: number
    usage: number
    read_mb: number
    write_mb: number
  }>
  fans: Array<{
    name: string
    label: string
    rpm: number
    pwm_pct: number
    speed_percent?: number
    has_pwm?: boolean
    mode: string
  }>
  gpu?: {
    temp: number
    usage: number
    vram_used_gb: number
    vram_total_gb: number
    freq: number
    power_w: number
    fan_rpm: number
  }
  // Backend pode enviar como power_profile{} ou campos soltos
  power_profile?: {
    current: string
    available: string[]
    current_governor: string
  }
  current_profile?: string
  available_profiles?: string[]
  current_governor?: string
  system: {
    hostname: string
    kernel: string
    os: string
    uptime: string
    board: string
  }
  timestamp: number
}

const HISTORY_LEN = 60

export function useSensorData(url = 'ws://localhost:8765') {
  const [state, setState]       = useState<ConnectionState>('connecting')
  const [data, setData]         = useState<SensorData | null>(null)
  const [history, setHistory]   = useState<number[]>([])        // CPU usage history
  const [tempHistory, setTempHistory] = useState<number[]>([])  // CPU temp history
  const wsRef = useRef<WebSocket | null>(null)
  const retryRef = useRef<ReturnType<typeof setTimeout>>()

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    setState('connecting')
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen  = () => { setState('connected'); clearTimeout(retryRef.current) }
    ws.onclose = () => {
      setState('disconnected')
      retryRef.current = setTimeout(connect, 3000)
    }
    ws.onerror = () => { setState('error'); ws.close() }

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data)
        // Backend envia 'initial_data' no primeiro envio e 'sensors_update' nas atualizações
        if (msg.type === 'sensors' || msg.type === 'initial_data' || msg.type === 'sensors_update') {
          // Dados podem estar em msg.data ou direto em msg
          const d: SensorData = msg.data ?? msg
          setData(d)
          setHistory(h => [...h.slice(-(HISTORY_LEN-1)), d.cpu?.usage ?? 0])
          setTempHistory(h => [...h.slice(-(HISTORY_LEN-1)), d.cpus_temps?.[0]?.package ?? d.temperatures?.cpu ?? 0])
        }
      } catch { /* ignore */ }
    }
  }, [url])

  useEffect(() => {
    connect()
    return () => {
      clearTimeout(retryRef.current)
      wsRef.current?.close()
    }
  }, [connect])

  const sendCommand = useCallback((cmd: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(cmd))
    }
  }, [])

  return { state, data, history, tempHistory, sendCommand }
}
