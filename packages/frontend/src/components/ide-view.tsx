'use client'

import { useState, useEffect } from 'react'
import { AnimatedDots } from '@/components/ui/animated-dots'

interface IDEViewProps {
  vscodeUrl: string
  containerStatus: string
}

const MIN_LOADING_TIME = 8000 // Minimum 8 seconds loading time

export function IDEView({ vscodeUrl, containerStatus }: IDEViewProps) {
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
      {/* Loading overlay */}
      {isIframeLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-terminal-bg z-10">
          <div className="text-center">
            <svg className="mx-auto h-16 w-16 text-blue-500 mb-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M23.15 2.587L18.21.21a1.494 1.494 0 0 0-1.705.29l-9.46 8.63-4.12-3.128a.999.999 0 0 0-1.276.057L.327 7.261A1 1 0 0 0 .326 8.74L3.899 12 .326 15.26a1 1 0 0 0 .001 1.479L1.65 17.94a.999.999 0 0 0 1.276.057l4.12-3.128 9.46 8.63a1.492 1.492 0 0 0 1.704.29l4.942-2.377A1.5 1.5 0 0 0 24 20.06V3.939a1.5 1.5 0 0 0-.85-1.352zm-5.146 14.861L10.826 12l7.178-5.448v10.896z" />
            </svg>
            <AnimatedDots text="Loading VS Code" />
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
  )
}
