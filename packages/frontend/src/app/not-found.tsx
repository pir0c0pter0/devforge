import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-terminal-bg">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-terminal-green mb-4">404</h1>
        <h2 className="text-2xl font-semibold text-terminal-text mb-4">
          Pagina nao encontrada
        </h2>
        <p className="text-terminal-muted mb-8">
          A pagina que voce esta procurando nao existe.
        </p>
        <Link
          href="/"
          className="px-6 py-3 bg-terminal-green text-terminal-bg rounded-lg hover:bg-terminal-green/90 transition-colors inline-block"
        >
          Voltar para Home
        </Link>
      </div>
    </div>
  )
}
