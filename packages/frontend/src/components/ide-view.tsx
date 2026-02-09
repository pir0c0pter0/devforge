'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { AnimatedDots } from '@/components/ui/animated-dots'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface IDEViewProps {
  vscodeUrl: string
  containerStatus: string
  containerId: string
}

const FADE_DURATION = 1500
const MAX_LOADING_TIME = 30000
const POLL_INTERVAL = 2000
// After health + iframe load confirmed, short delay for workbench JS to paint
const POST_READY_DELAY = 2000

const getLoadingText = (phase: string, elapsed: number): string => {
  if (phase === 'polling') {
    if (elapsed < 5000) return 'Connecting to VS Code'
    if (elapsed < 12000) return 'Downloading editor (11 MB)'
    if (elapsed < 20000) return 'Initializing workbench'
    if (elapsed < 35000) return 'Loading extensions'
    return 'Almost ready'
  }
  if (phase === 'rendering') return 'Rendering editor'
  return 'VS Code ready!'
}

export function IDEView({ vscodeUrl, containerStatus, containerId }: IDEViewProps) {
  const [overlayPhase, setOverlayPhase] = useState<'visible' | 'fading' | 'hidden'>('visible')
  const [loadingText, setLoadingText] = useState('Connecting to VS Code')
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const mountTimeRef = useRef(Date.now())
  const fadeStartedRef = useRef(false)
  const pollingRef = useRef(true)
  const iframeLoadedRef = useRef(false)
  const pollPhaseRef = useRef<string>('polling')

  const startFade = useCallback(() => {
    if (fadeStartedRef.current) return
    fadeStartedRef.current = true
    setOverlayPhase('fading')
    setTimeout(() => setOverlayPhase('hidden'), FADE_DURATION)
  }, [])

  const handleIframeLoad = useCallback(() => {
    iframeLoadedRef.current = true
  }, [])

  // Poll backend health API until code-server HTTP is responding.
  // Backend execs `curl /healthz` inside the container and returns { ready: true }.
  // Then wait for iframe onLoad + short delay for workbench JS to paint.
  useEffect(() => {
    if (containerStatus !== 'running' || !containerId) return

    pollingRef.current = true
    const abortController = new AbortController()

    const poll = async () => {
      while (pollingRef.current && (Date.now() - mountTimeRef.current) < MAX_LOADING_TIME) {
        try {
          const resp = await fetch(
            `${API_URL}/api/containers/${containerId}/vscode-health`,
            { signal: abortController.signal, credentials: 'include' }
          )
          if (resp.ok) {
            const json = await resp.json()
            const data = json.data ?? json

            if (data.ready) {
              pollPhaseRef.current = 'rendering'
              setLoadingText('Rendering editor')

              // Wait for iframe onLoad (HTML delivered by browser)
              const waitStart = Date.now()
              while (!iframeLoadedRef.current && (Date.now() - waitStart) < 10000) {
                await new Promise(r => setTimeout(r, 500))
              }

              await new Promise(r => setTimeout(r, POST_READY_DELAY))
              startFade()
              return
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
  }, [containerStatus, containerId, startFade])

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
      setLoadingText(getLoadingText(pollPhaseRef.current, elapsed))
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
        onLoad={handleIframeLoad}
      />
    </div>
  )
}
