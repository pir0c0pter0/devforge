'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { AnimatedDots } from '@/components/ui/animated-dots'

interface IDEViewProps {
  vscodeUrl: string
  containerStatus: string
  containerId: string
}

// After iframe onLoad fires, VS Code still needs time to bootstrap internally
// (load JS bundles, initialize extensions, render the workbench).
// We keep the overlay for this extra duration after onLoad.
const POST_LOAD_RENDER_DELAY = 4000
const MAX_LOADING_TIME = 30000 // 30s absolute timeout

const getLoadingText = (elapsed: number): string => {
  if (elapsed < 3000) return 'Connecting to VS Code'
  if (elapsed < 8000) return 'Loading editor'
  if (elapsed < 15000) return 'Initializing extensions'
  if (elapsed < 25000) return 'Almost ready'
  return 'Still loading (this may take a moment)'
}

export function IDEView({ vscodeUrl, containerStatus }: IDEViewProps) {
  const [showOverlay, setShowOverlay] = useState(true)
  const [loadingText, setLoadingText] = useState('Connecting to VS Code')
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const mountTimeRef = useRef(Date.now())

  // When iframe onLoad fires, wait extra time for VS Code to render internally
  const handleIframeLoad = useCallback(() => {
    const elapsed = Date.now() - mountTimeRef.current
    // At minimum wait POST_LOAD_RENDER_DELAY after onLoad, but never exceed MAX_LOADING_TIME total
    const remaining = Math.min(
      POST_LOAD_RENDER_DELAY,
      Math.max(0, MAX_LOADING_TIME - elapsed)
    )
    setLoadingText('VS Code loading...')
    setTimeout(() => setShowOverlay(false), remaining)
  }, [])

  // Absolute timeout — hide overlay even if onLoad never fires
  useEffect(() => {
    const timer = setTimeout(() => setShowOverlay(false), MAX_LOADING_TIME)
    return () => clearTimeout(timer)
  }, [])

  // Progressive loading text
  useEffect(() => {
    if (!showOverlay) return
    const interval = setInterval(() => {
      const elapsed = Date.now() - mountTimeRef.current
      setLoadingText(getLoadingText(elapsed))
    }, 1000)
    return () => clearInterval(interval)
  }, [showOverlay])

  if (containerStatus !== 'running') {
    return (
      <div className="h-full flex items-center justify-center bg-terminal-bg">
        <div className="text-center">
          <svg className="mx-auto h-16 w-16 text-terminal-textMuted mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <h3 className="text-lg font-semibold text-terminal-text mb-2">IDE not available</h3>
          <p className="text-sm text-terminal-textMuted">Start the container to access VS Code</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full relative bg-terminal-bg">
      {/* Loading overlay — hides after iframe onLoad + render delay or absolute timeout */}
      {showOverlay && (
        <div className="absolute inset-0 flex items-center justify-center bg-terminal-bg z-10">
          <div className="text-center">
            <svg className="mx-auto h-16 w-16 text-blue-500 mb-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M23.15 2.587L18.21.21a1.494 1.494 0 0 0-1.705.29l-9.46 8.63-4.12-3.128a.999.999 0 0 0-1.276.057L.327 7.261A1 1 0 0 0 .326 8.74L3.899 12 .326 15.26a1 1 0 0 0 .001 1.479L1.65 17.94a.999.999 0 0 0 1.276.057l4.12-3.128 9.46 8.63a1.492 1.492 0 0 0 1.704.29l4.942-2.377A1.5 1.5 0 0 0 24 20.06V3.939a1.5 1.5 0 0 0-.85-1.352zm-5.146 14.861L10.826 12l7.178-5.448v10.896z" />
            </svg>
            <AnimatedDots text={loadingText} />
          </div>
        </div>
      )}
      <iframe
        ref={iframeRef}
        src={vscodeUrl}
        className="w-full h-full border-0"
        title="VS Code"
        allow="clipboard-read; clipboard-write"
        onLoad={handleIframeLoad}
      />
    </div>
  )
}
