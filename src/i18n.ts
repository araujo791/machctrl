// Detecta idioma: localStorage > sistema
function detectLang(): 'pt' | 'en' {
  const saved = localStorage.getItem('machctrl-lang')
  if (saved === 'pt' || saved === 'en') return saved
  const sys = (navigator.language || 'en').toLowerCase()
  if (sys.startsWith('pt')) return 'pt'
  return 'en'
}

export const lang = detectLang()

const translations = {
  pt: {
    // Sidebar / tabs
    overview: 'Visão Geral',
    cpu: 'CPU',
    memory: 'Memória',
    disks: 'Discos',
    fans: 'Fans',
    power: 'Perfil de Energia',
    cleaner: 'Limpeza',
    benchmark: 'Benchmark',
    about: 'Sobre',
    // Fan modes
    auto: 'Automático',
    manual: 'Manual',
    max: 'Máximo',
    curve: 'Curva',
    // Fan curve editor
    fanCurveTitle: 'Curva de Fan',
    gpuLabel: 'GPU',
    fanLabel: 'Fan',
    controlPoints: 'Pontos de controle — arraste no gráfico ou edite abaixo:',
    point: 'Ponto',
    tempC: 'Temp °C',
    fanPct: 'Fan %',
    resetDefault: 'Resetar padrão',
    applyCurve: '✓ Aplicar Curva',
    resetWarning: 'A curva atual será perdida e as fans voltarão ao modo automático. Confirmar?',
    cancel: 'Cancelar',
    confirmReset: 'Confirmar reset',
    curveActive: 'Curva ativa — clique para editar',
    // General
    connected: 'Conectado',
    disconnected: 'Desconectado',
    connecting: 'Conectando ao backend...',
    error: 'Erro — tentando reconectar...',
    backendOff: 'Backend desconectado',
    loading: 'Carregando...',
    temperature: 'Temperatura',
    usage: 'Uso',
    rpm: 'RPM',
    minimum: 'Mínimo',
    maximum: 'Máximo',
    // Sidebar
    sideOverview: 'Visão Geral',
    sideCpu: 'CPU',
    sideMemory: 'Memória',
    sideDisks: 'Discos',
    sideFans: 'Fans',
    sidePower: 'Energia',
    sideCleaner: 'Limpeza',
    sideBenchmark: 'Benchmark',
    sideAbout: 'Sobre',
    // Fan
    fanMin15: 'Mínimo 15%',
    fanMax100: 'Máximo 100%',
    fanManualPct: (p: number) => `Manual — ${p}%`,
    fanMaxMode: 'Máximo — 100%',
    // Power
    powerEco: 'Economia',
    powerBalanced: 'Equilibrado',
    powerPerf: 'Desempenho',
    powerLow: 'Baixo',
    powerMid: 'Médio',
    powerHigh: 'Alto',
    powerTurboOff: 'Desligado',
    powerTurboAuto: 'Automático',
    powerTurboOn: 'Ligado',
    // Benchmark
    benchCpu: 'CPU (Crivo de Eratóstenes)',
    benchMem: 'Memória (Largura de Banda)',
    benchFp: 'CPU Ponto Flutuante',
    benchCpuLabel: 'CPU — Crivo de Eratóstenes',
    benchFpLabel: 'CPU — Ponto Flutuante',
    benchMemLabel: 'Memória — Largura de Banda',
  },
  en: {
    // Sidebar / tabs
    overview: 'Overview',
    cpu: 'CPU',
    memory: 'Memory',
    disks: 'Disks',
    fans: 'Fans',
    power: 'Power Profile',
    cleaner: 'Cleaner',
    benchmark: 'Benchmark',
    about: 'About',
    // Fan modes
    auto: 'Auto',
    manual: 'Manual',
    max: 'Maximum',
    curve: 'Curve',
    // Fan curve editor
    fanCurveTitle: 'Fan Curve',
    gpuLabel: 'GPU',
    fanLabel: 'Fan',
    controlPoints: 'Control points — drag on graph or edit below:',
    point: 'Point',
    tempC: 'Temp °C',
    fanPct: 'Fan %',
    resetDefault: 'Reset to default',
    applyCurve: '✓ Apply Curve',
    resetWarning: 'Current curve will be lost and fans will return to auto mode. Confirm?',
    cancel: 'Cancel',
    confirmReset: 'Confirm reset',
    curveActive: 'Curve active — click to edit',
    // General
    connected: 'Connected',
    disconnected: 'Disconnected',
    connecting: 'Connecting to backend...',
    error: 'Error — trying to reconnect...',
    backendOff: 'Backend disconnected',
    loading: 'Loading...',
    temperature: 'Temperature',
    usage: 'Usage',
    rpm: 'RPM',
    minimum: 'Minimum',
    maximum: 'Maximum',
    // Sidebar
    sideOverview: 'Overview',
    sideCpu: 'CPU',
    sideMemory: 'Memory',
    sideDisks: 'Disks',
    sideFans: 'Fans',
    sidePower: 'Power',
    sideCleaner: 'Cleaner',
    sideBenchmark: 'Benchmark',
    sideAbout: 'About',
    // Fan
    fanMin15: 'Minimum 15%',
    fanMax100: 'Maximum 100%',
    fanManualPct: (p: number) => `Manual — ${p}%`,
    fanMaxMode: 'Maximum — 100%',
    // Power
    powerEco: 'Power Saver',
    powerBalanced: 'Balanced',
    powerPerf: 'Performance',
    powerLow: 'Low',
    powerMid: 'Medium',
    powerHigh: 'High',
    powerTurboOff: 'Off',
    powerTurboAuto: 'Auto',
    powerTurboOn: 'On',
    // Benchmark
    benchCpu: 'CPU (Sieve of Eratosthenes)',
    benchMem: 'Memory (Bandwidth)',
    benchFp: 'CPU Floating Point',
    benchCpuLabel: 'CPU — Sieve of Eratosthenes',
    benchFpLabel: 'CPU — Floating Point',
    benchMemLabel: 'Memory — Bandwidth',
  },
}

type TranslationKey = keyof typeof translations.pt

export function t(key: TranslationKey): string {
  const val = translations[lang][key] ?? translations.en[key] ?? key
  return typeof val === 'function' ? key : val as string
}

export function tf(key: TranslationKey, ...args: any[]): string {
  const fn = (translations[lang][key] ?? translations.en[key]) as any
  return typeof fn === 'function' ? fn(...args) : String(fn ?? key)
}
