'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Global error:', error)
  }, [error])

  return (
    <html lang="pt-BR">
      <body style={{
        margin: 0,
        padding: 0,
        minHeight: '100vh',
        backgroundColor: '#0d1117',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{ textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
          <h1 style={{ fontSize: '4rem', fontWeight: 'bold', color: '#f85149', marginBottom: '1rem' }}>
            Erro
          </h1>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '600', color: '#c9d1d9', marginBottom: '1rem' }}>
            Algo deu errado
          </h2>
          <p style={{ color: '#8b949e', marginBottom: '2rem' }}>
            Ocorreu um erro inesperado. Por favor, tente novamente.
          </p>
          <button
            onClick={reset}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#f0c000',
              color: '#0d1117',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: '500'
            }}
          >
            Tentar novamente
          </button>
        </div>
      </body>
    </html>
  )
}
