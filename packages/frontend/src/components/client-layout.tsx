'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { I18nProvider, useI18n } from '@/lib/i18n'

function Header() {
  const { t } = useI18n()
  const pathname = usePathname()

  const isActive = (path: string) => {
    if (path === '/') return pathname === '/'
    return pathname.startsWith(path)
  }

  return (
    <header className="bg-terminal-bgLight border-b border-terminal-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-terminal-green/20 border border-terminal-green/50 rounded-lg flex items-center justify-center">
              <span className="text-terminal-green text-lg font-bold">&gt;_</span>
            </div>
            <div>
              <h1 className="text-lg font-bold text-terminal-green terminal-glow">
                {t.appName}
              </h1>
              <p className="text-xs text-terminal-textMuted">
                {t.appDescription}
              </p>
            </div>
          </div>
          <nav className="flex items-center space-x-1">
            <Link
              href="/"
              className={`nav-link text-sm ${isActive('/') && pathname === '/' ? 'nav-link-active' : ''}`}
            >
              {t.nav.dashboard}
            </Link>
            <Link
              href="/containers"
              className={`nav-link text-sm ${isActive('/containers') && !pathname.includes('/new') ? 'nav-link-active' : ''}`}
            >
              {t.nav.containers}
            </Link>
            <Link
              href="/settings"
              className={`nav-link text-sm ${isActive('/settings') ? 'nav-link-active' : ''}`}
            >
              {t.nav.settings}
            </Link>
            <Link
              href="/containers/new"
              className="btn-primary text-sm ml-2"
            >
              + {t.nav.newContainer}
            </Link>
          </nav>
        </div>
      </div>
    </header>
  )
}

function LayoutContent({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
      <footer className="border-t border-terminal-border mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <p className="text-xs text-terminal-textMuted text-center">
            <span className="text-terminal-green">$</span> claude-docker-web v1.0.0
          </p>
        </div>
      </footer>
    </>
  )
}

export function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <LayoutContent>{children}</LayoutContent>
    </I18nProvider>
  )
}
