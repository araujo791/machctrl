import { useState, useCallback } from 'react'
import { lang as detectedLang } from '../i18n'

export type Lang = 'pt' | 'en'

export function useLang() {
  const [currentLang, setCurrentLang] = useState<Lang>(detectedLang)

  const toggle = useCallback(() => {
    const next: Lang = currentLang === 'pt' ? 'en' : 'pt'
    setCurrentLang(next)
    // Força reload da página para reaplicar todas as traduções
    localStorage.setItem('machctrl-lang', next)
    window.location.reload()
  }, [currentLang])

  return { currentLang, toggle }
}
