// Detecta idioma do sistema (Electron expõe via navigator.language)
function detectLang(): 'pt' | 'en' {
  const lang = (navigator.language || 'en').toLowerCase()
  if (lang.startsWith('pt')) return 'pt'
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
    connecting: 'Conectando...',
    loading: 'Carregando...',
    temperature: 'Temperatura',
    usage: 'Uso',
    rpm: 'RPM',
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
    connecting: 'Connecting...',
    loading: 'Loading...',
    temperature: 'Temperature',
    usage: 'Usage',
    rpm: 'RPM',
  },
}

type TranslationKey = keyof typeof translations.pt

export function t(key: TranslationKey): string {
  return translations[lang][key] ?? translations.en[key] ?? key
}
