'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { I18nProvider, useI18n } from '@/lib/i18n'
import { ModalProvider } from '@/components/ui/modal'
import { ToastProvider } from '@/components/ui/toast'
import { APP_INFO } from '@/lib/version'

function Header() {
  const { t } = useI18n()
  const pathname = usePathname()

  const isActive = (path: string) => {
    if (path === '/') return pathname === '/'
    return pathname.startsWith(path)
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-terminal-bgLight border-b border-terminal-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Image
              src="/logo-icon.png"
              alt="DevForge"
              width={40}
              height={40}
              className="flex-shrink-0"
            />
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
    <div className="min-h-screen flex flex-col">
      <Header />
      {/* Spacer for fixed header (h-16 = 4rem = header height) */}
      <div className="h-16 flex-shrink-0" />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
      <footer className="border-t border-terminal-border flex-shrink-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <p className="text-xs text-terminal-textMuted text-center">
            <span className="text-terminal-green">$</span> {APP_INFO.fullName}
          </p>
        </div>
      </footer>
    </div>
  )
}

export function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <ToastProvider>
        <ModalProvider>
          <LayoutContent>{children}</LayoutContent>
        </ModalProvider>
      </ToastProvider>
    </I18nProvider>
  )
}
