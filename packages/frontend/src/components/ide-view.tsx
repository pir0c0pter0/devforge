'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import clsx from 'clsx'
import { AnimatedDots } from '@/components/ui/animated-dots'

const ClaudeChat = dynamic(
  () => import('@/components/claude-chat').then(mod => mod.ClaudeChat),
  { ssr: false, loading: () => <div className="p-4 text-center"><AnimatedDots text="Loading Claude..." /></div> }
)

interface IDEViewProps {
  containerId: string
  vscodeUrl: string
  containerStatus: string
}

const MIN_LOADING_TIME = 8000 // Minimum 8 seconds loading time

export function IDEView({ containerId, vscodeUrl, containerStatus }: IDEViewProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [sidebarWidth, setSidebarWidth] = useState(400)
  const [isResizing, setIsResizing] = useState(false)
  const [isIframeLoading, setIsIframeLoading] = useState(true)
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const [minTimeElapsed, setMinTimeElapsed] = useState(false)

  // Minimum loading time to ensure VS Code has time to render
  useEffect(() => {
    const timer = setTimeout(() => {
      setMinTimeElapsed(true)
    }, MIN_LOADING_TIME)
    return () => clearTimeout(timer)
  }, [])

  // Hide loading only when both conditions are met
  useEffect(() => {
    if (iframeLoaded && minTimeElapsed) {
      setIsIframeLoading(false)
    }
  }, [iframeLoaded, minTimeElapsed])

  // Handle resize drag
  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = window.innerWidth - e.clientX
      if (newWidth >= 300 && newWidth <= 800) {
        setSidebarWidth(newWidth)
      }
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing])

  if (containerStatus !== 'running') {
    return (
      <div className="h-full flex items-center justify-center bg-terminal-bg">
        <div className="text-center">
          <svg className="mx-auto h-16 w-16 text-terminal-textMuted mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <h3 className="text-lg font-semibold text-terminal-text mb-2">IDE não disponível</h3>
          <p className="text-sm text-terminal-textMuted">Inicie o container para acessar o VS Code</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex relative bg-terminal-bg">
      {/* VS Code iframe - Main area */}
      <div
        className="flex-1 h-full transition-all duration-200 relative"
        style={{ marginRight: isSidebarOpen ? sidebarWidth : 0 }}
      >
        {/* Loading overlay */}
        {isIframeLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-terminal-bg z-10">
            <div className="text-center">
              <svg className="mx-auto h-16 w-16 text-blue-500 mb-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M23.15 2.587L18.21.21a1.494 1.494 0 0 0-1.705.29l-9.46 8.63-4.12-3.128a.999.999 0 0 0-1.276.057L.327 7.261A1 1 0 0 0 .326 8.74L3.899 12 .326 15.26a1 1 0 0 0 .001 1.479L1.65 17.94a.999.999 0 0 0 1.276.057l4.12-3.128 9.46 8.63a1.492 1.492 0 0 0 1.704.29l4.942-2.377A1.5 1.5 0 0 0 24 20.06V3.939a1.5 1.5 0 0 0-.85-1.352zm-5.146 14.861L10.826 12l7.178-5.448v10.896z" />
              </svg>
              <AnimatedDots text="Carregando VS Code" />
            </div>
          </div>
        )}
        <iframe
          src={vscodeUrl}
          className="w-full h-full border-0"
          title="VS Code"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
          onLoad={() => setIframeLoaded(true)}
        />
      </div>

      {/* Toggle button - Always visible */}
      <button
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        className={clsx(
          'absolute top-4 z-20 p-2 rounded-l-lg bg-terminal-bgLight border border-terminal-border',
          'hover:bg-terminal-border transition-all duration-200',
          'flex items-center gap-2',
          isSidebarOpen ? 'right-0' : 'right-0'
        )}
        style={isSidebarOpen ? { right: sidebarWidth } : { right: 0 }}
        title={isSidebarOpen ? 'Ocultar Claude' : 'Mostrar Claude'}
      >
        {/* Claude Icon */}
        <svg className="w-5 h-5 text-terminal-text" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
        </svg>
        {/* Arrow */}
        <svg
          className={clsx('w-4 h-4 text-terminal-textMuted transition-transform', !isSidebarOpen && 'rotate-180')}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* Claude Code Sidebar */}
      <div
        className={clsx(
          'absolute top-0 right-0 h-full bg-terminal-bg border-l border-terminal-border',
          'transition-all duration-200 flex flex-col',
          !isSidebarOpen && 'translate-x-full'
        )}
        style={{ width: sidebarWidth }}
      >
        {/* Resize handle */}
        <div
          className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-terminal-green/50 z-10"
          onMouseDown={() => setIsResizing(true)}
        />

        {/* Sidebar header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-terminal-border bg-terminal-bgLight">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-orange-500" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
              <circle cx="12" cy="12" r="5" fill="currentColor"/>
            </svg>
            <span className="font-medium text-terminal-text">Claude Code</span>
          </div>
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="p-1 hover:bg-terminal-border rounded transition-colors"
            title="Ocultar sidebar"
          >
            <svg className="w-4 h-4 text-terminal-textMuted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Claude Chat content */}
        <div className="flex-1 overflow-hidden">
          <ClaudeChat containerId={containerId} />
        </div>
      </div>

      {/* Resize overlay to prevent iframe from capturing mouse events */}
      {isResizing && (
        <div className="fixed inset-0 z-30 cursor-col-resize" />
      )}
    </div>
  )
}
