'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import clsx from 'clsx'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/lib/i18n'

interface NavItem {
  key: 'dashboard' | 'containers' | 'templates' | 'metrics' | 'settings'
  href: string
  icon: React.ReactNode
}

const navItems: NavItem[] = [
  {
    key: 'dashboard',
    href: '/',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
        />
      </svg>
    ),
  },
  {
    key: 'containers',
    href: '/containers',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
        />
      </svg>
    ),
  },
  {
    key: 'templates',
    href: '/templates',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
        />
      </svg>
    ),
  },
  {
    key: 'metrics',
    href: '/metrics',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
        />
      </svg>
    ),
  },
  {
    key: 'settings',
    href: '/settings',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </svg>
    ),
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const { user, logout, isAuthenticated } = useAuth()
  const { t } = useI18n()
  const [isCollapsed, setIsCollapsed] = useState(false)

  if (!isAuthenticated) {
    return null
  }

  const getNavName = (key: NavItem['key']): string => {
    return t.nav[key]
  }

  return (
    <aside
      className={clsx(
        'fixed left-0 top-0 h-full bg-terminal-bgLight border-r border-terminal-border transition-all duration-300 z-40',
        isCollapsed ? 'w-16' : 'w-64'
      )}
    >
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="p-4 border-b border-terminal-border">
          <div className="flex items-center justify-between">
            <div className={clsx('flex items-center space-x-3', isCollapsed && 'justify-center')}>
              <Image
                src="/logo-icon.png"
                alt="DevForge"
                width={40}
                height={40}
                className="flex-shrink-0"
              />
              {!isCollapsed && (
                <div className="min-w-0">
                  <h1 className="text-lg font-bold text-terminal-text truncate">
                    DevForge
                  </h1>
                  <p className="text-xs text-terminal-textMuted">{t.nav.manager}</p>
                </div>
              )}
            </div>
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className={clsx(
                'p-1.5 rounded-lg text-terminal-textMuted hover:bg-terminal-bg transition-colors',
                isCollapsed && 'mx-auto'
              )}
            >
              <svg
                className={clsx('w-5 h-5 transition-transform', isCollapsed && 'rotate-180')}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href ||
              (item.href !== '/' && pathname.startsWith(item.href))
            const name = getNavName(item.key)

            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                  isActive
                    ? 'bg-terminal-green/10 text-terminal-green'
                    : 'text-terminal-text hover:bg-terminal-bg hover:text-terminal-green',
                  isCollapsed && 'justify-center'
                )}
                title={isCollapsed ? name : undefined}
              >
                {item.icon}
                {!isCollapsed && <span className="font-medium">{name}</span>}
              </Link>
            )
          })}
        </nav>

        {/* Quick Actions */}
        {!isCollapsed && (
          <div className="p-4 border-t border-terminal-border">
            <Link
              href="/containers/new"
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                />
              </svg>
              {t.nav.newContainer}
            </Link>
          </div>
        )}

        {/* User Section */}
        <div className="p-4 border-t border-terminal-border">
          <div className={clsx('flex items-center', isCollapsed ? 'justify-center' : 'gap-3')}>
            <div className="w-9 h-9 bg-terminal-border rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-medium text-terminal-text">
                {user?.username?.charAt(0).toUpperCase() || 'U'}
              </span>
            </div>
            {!isCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-terminal-text truncate">
                  {user?.username || 'User'}
                </p>
                <button
                  onClick={logout}
                  className="text-xs text-terminal-textMuted hover:text-terminal-green transition-colors"
                >
                  {t.nav.signOut}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  )
}
