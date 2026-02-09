'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { AnimatedDots } from '@/components/ui/animated-dots'

interface IDEViewProps {
  vscodeUrl: string
  containerStatus: string
  containerId: string
}

const FADE_DURATION = 1500
const MAX_LOADING_TIME = 60000
const POLL_INTERVAL = 1500
// Extra delay after workbench heartbeat detected — lets the UI finish painting
const POST_HEARTBEAT_DELAY = 3000

const getLoadingText = (elapsed: number): string => {
  if (elapsed < 3000) return 'Connecting to VS Code'
  if (elapsed < 8000) return 'Downloading editor'
  if (elapsed < 15000) return 'Initializing workbench'
  if (elapsed < 25000) return 'Loading extensions'
  if (elapsed < 40000) return 'Almost ready'
  return 'Finalizing...'
}

/**
 * Extract base URL from VS Code URL (e.g. "http://host:port/?folder=..." -> "http://host:port")
 */
const getBaseUrl = (url: string): string => {
  try {
    const parsed = new URL(url)
    return `${parsed.protocol}//${parsed.host}`
  } catch {
    return url.split('?')[0]
  }
}

export function IDEView({ vscodeUrl, containerStatus }: IDEViewProps) {
  const [overlayPhase, setOverlayPhase] = useState<'visible' | 'fading' | 'hidden'>('visible')
  const [loadingText, setLoadingText] = useState('Connecting to VS Code')
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const mountTimeRef = useRef(Date.now())
  const fadeStartedRef = useRef(false)
  const pollingRef = useRef(true)

  const startFade = useCallback(() => {
    if (fadeStartedRef.current) return
    fadeStartedRef.current = true
    setOverlayPhase('fading')
    setTimeout(() => setOverlayPhase('hidden'), FADE_DURATION)
  }, [])

  // Poll code-server /healthz directly from the browser.
  // The heartbeat is only updated once the workbench JS has loaded and executed,
  // making it a reliable indicator that VS Code has actually rendered.
  useEffect(() => {
    if (containerStatus !== 'running' || !vscodeUrl) return

    pollingRef.current = true
    const baseUrl = getBaseUrl(vscodeUrl)
    const abortController = new AbortController()

    const poll = async () => {
      // Wait a moment before first poll (let the iframe start loading)
      await new Promise(r => setTimeout(r, 2000))

      while (pollingRef.current && (Date.now() - mountTimeRef.current) < MAX_LOADING_TIME) {
        try {
          const resp = await fetch(`${baseUrl}/healthz`, {
            signal: abortController.signal,
            // no credentials — code-server has auth:none
          })
          if (resp.ok) {
            const data = await resp.json()
            // code-server returns { status: "alive", lastHeartbeat: <timestamp> }
            // A recent heartbeat (<30s) means the workbench is actively running
            if (data.status === 'alive' && data.lastHeartbeat) {
              const heartbeatAge = Date.now() - data.lastHeartbeat
              if (heartbeatAge < 30000) {
                setLoadingText('VS Code ready!')
                // Wait a bit more for the UI to finish painting after heartbeat
                await new Promise(r => setTimeout(r, POST_HEARTBEAT_DELAY))
                startFade()
                return
              }
            }
          }
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') return
        }

        await new Promise(r => setTimeout(r, POLL_INTERVAL))
      }

      // Timeout — fade anyway
      startFade()
    }

    poll()

    return () => {
      pollingRef.current = false
      abortController.abort()
    }
  }, [containerStatus, vscodeUrl, startFade])

  // Absolute safety timeout
  useEffect(() => {
    const timer = setTimeout(startFade, MAX_LOADING_TIME)
    return () => clearTimeout(timer)
  }, [startFade])

  // Progressive loading text
  useEffect(() => {
    if (overlayPhase === 'hidden') return
    const interval = setInterval(() => {
      const elapsed = Date.now() - mountTimeRef.current
      setLoadingText(getLoadingText(elapsed))
    }, 1000)
    return () => clearInterval(interval)
  }, [overlayPhase])

  if (containerStatus !== 'running') {
    return (
      <div className="h-full flex items-center justify-center bg-[#1e1e1e]">
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
    <div className="h-full relative" style={{ backgroundColor: '#1e1e1e' }}>
      {overlayPhase !== 'hidden' && (
        <div
          className="absolute inset-0 flex items-center justify-center z-10"
          style={{
            backgroundColor: '#1e1e1e',
            opacity: overlayPhase === 'fading' ? 0 : 1,
            transition: `opacity ${FADE_DURATION}ms ease-in-out`,
            pointerEvents: overlayPhase === 'fading' ? 'none' : 'auto',
          }}
        >
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
      />
    </div>
  )
}
