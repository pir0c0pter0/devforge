'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('App error:', error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-terminal-bg">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-terminal-red mb-4">Erro</h1>
        <h2 className="text-2xl font-semibold text-terminal-text mb-4">
          Algo deu errado
        </h2>
        <p className="text-terminal-muted mb-8">
          {error.message || 'Ocorreu um erro inesperado.'}
        </p>
        <button
          onClick={reset}
          className="px-6 py-3 bg-terminal-yellow text-terminal-bg rounded-lg hover:bg-terminal-yellow/90 transition-colors"
        >
          Tentar novamente
        </button>
      </div>
    </div>
  )
}
