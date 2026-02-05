'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { translations, Language } from './translations'

const STORAGE_KEY = 'devforge-language'

// Cotação aproximada USD -> BRL (atualizar conforme necessário)
const USD_TO_BRL_RATE = 5.80

type TranslationType = typeof translations['pt-BR'] | typeof translations['en']

/**
 * Formata valor monetário de acordo com o idioma
 * - pt-BR: R$ (converte de USD para BRL usando cotação)
 * - en: $ (mantém em USD)
 */
function formatCurrencyValue(usd: number, language: Language): string {
  if (usd === 0) return language === 'pt-BR' ? 'R$ 0,00' : '$0.00'

  if (language === 'pt-BR') {
    const brl = usd * USD_TO_BRL_RATE
    // Para valores pequenos, mostrar mais casas decimais
    if (brl < 0.01) {
      return `R$ ${brl.toFixed(4).replace('.', ',')}`
    }
    return `R$ ${brl.toFixed(2).replace('.', ',')}`
  } else {
    // Inglês: manter em USD
    if (usd < 0.01) {
      return `$${usd.toFixed(4)}`
    }
    return `$${usd.toFixed(2)}`
  }
}

interface I18nContextType {
  language: Language
  setLanguage: (lang: Language) => void
  t: TranslationType
  formatCurrency: (usd: number) => string
}

const I18nContext = createContext<I18nContextType | undefined>(undefined)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>('pt-BR')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Language | null
    if (stored && (stored === 'pt-BR' || stored === 'en')) {
      setLanguageState(stored)
    }
    setMounted(true)
  }, [])

  const setLanguage = (lang: Language) => {
    setLanguageState(lang)
    localStorage.setItem(STORAGE_KEY, lang)
  }

  const t = translations[language]

  const formatCurrency = (usd: number) => formatCurrencyValue(usd, language)

  if (!mounted) {
    return null
  }

  return (
    <I18nContext.Provider value={{ language, setLanguage, t, formatCurrency }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n() {
  const context = useContext(I18nContext)
  if (context === undefined) {
    throw new Error('useI18n must be used within an I18nProvider')
  }
  return context
}
