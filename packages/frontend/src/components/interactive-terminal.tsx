'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import clsx from 'clsx'

interface InteractiveTerminalProps {
  containerId: string
  onClose?: () => void
  className?: string
}

const WS_URL = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:8000'

export function InteractiveTerminal({ containerId, onClose, className }: InteractiveTerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<any>(null)
  const fitAddonRef = useRef<any>(null)
  const socketRef = useRef<Socket | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const sessionIdRef = useRef<string | null>(null)

  // Keep sessionId in sync with ref
  useEffect(() => {
    sessionIdRef.current = sessionId
  }, [sessionId])

  const handleResize = useCallback(() => {
    if (fitAddonRef.current && xtermRef.current && socketRef.current && sessionIdRef.current) {
      fitAddonRef.current.fit()
      const { cols, rows } = xtermRef.current
      socketRef.current.emit('terminal:resize', { sessionId: sessionIdRef.current, cols, rows })
    }
  }, [])

  useEffect(() => {
    let mounted = true
    let xterm: any = null

    const initTerminal = async () => {
      // Dynamic imports for SSR compatibility
      const xtermModule = await import('xterm')
      const fitAddonModule = await import('@xterm/addon-fit')
      const webLinksModule = await import('@xterm/addon-web-links')

      if (!mounted || !terminalRef.current) return

      // Create terminal instance
      xterm = new xtermModule.Terminal({
        cursorBlink: true,
        fontSize: 14,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        scrollback: 5000,
        convertEol: false, // Let the PTY handle line endings
        theme: {
          background: '#1e1e1e',
          foreground: '#d4d4d4',
          cursor: '#d4d4d4',
          black: '#000000',
          red: '#cd3131',
          green: '#0dbc79',
          yellow: '#e5e510',
          blue: '#2472c8',
          magenta: '#bc3fbc',
          cyan: '#11a8cd',
          white: '#e5e5e5',
          brightBlack: '#666666',
          brightRed: '#f14c4c',
          brightGreen: '#23d18b',
          brightYellow: '#f5f543',
          brightBlue: '#3b8eea',
          brightMagenta: '#d670d6',
          brightCyan: '#29b8db',
          brightWhite: '#ffffff',
        },
        allowProposedApi: true,
      })

      const fitAddon = new fitAddonModule.FitAddon()
      const webLinksAddon = new webLinksModule.WebLinksAddon()

      xterm.loadAddon(fitAddon)
      xterm.loadAddon(webLinksAddon)
      xterm.open(terminalRef.current)
      fitAddon.fit()

      xtermRef.current = xterm
      fitAddonRef.current = fitAddon

      // Connect WebSocket
      const socket = io(`${WS_URL}/terminal`, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 3,
        reconnectionDelay: 1000,
      })

      socketRef.current = socket

      socket.on('connect', () => {
        console.log('[Terminal] WebSocket connected')
        xterm.writeln('Connecting to container...')

        const { cols, rows } = xterm
        socket.emit('terminal:connect', { containerId, cols, rows }, (response: { sessionId?: string; error?: string }) => {
          if (response.error) {
            setError(response.error)
            xterm.writeln(`\r\n\x1b[31mError: ${response.error}\x1b[0m`)
            setIsLoading(false)
            return
          }
          if (response.sessionId) {
            setSessionId(response.sessionId)
            sessionIdRef.current = response.sessionId
            setIsConnected(true)
            setIsLoading(false)
            xterm.clear()
          }
        })
      })

      socket.on('terminal:ready', () => {
        console.log('[Terminal] Session ready')
      })

      socket.on('terminal:data', (data: { sessionId: string; data: string }) => {
        // Decode base64 data to Uint8Array for proper binary handling
        try {
          const binaryString = atob(data.data)
          const bytes = new Uint8Array(binaryString.length)
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i)
          }
          xterm.write(bytes)
        } catch (e) {
          console.error('[Terminal] Failed to decode data:', e)
        }
      })

      socket.on('terminal:close', (data: { sessionId: string; exitCode?: number }) => {
        xterm.writeln(`\r\n\x1b[33m[Session ended with code ${data.exitCode ?? 0}]\x1b[0m`)
        setIsConnected(false)
      })

      socket.on('terminal:error', (data: { sessionId: string; message: string }) => {
        xterm.writeln(`\r\n\x1b[31mError: ${data.message}\x1b[0m`)
        setError(data.message)
      })

      socket.on('disconnect', () => {
        console.log('[Terminal] WebSocket disconnected')
        setIsConnected(false)
        xterm.writeln('\r\n\x1b[33m[Disconnected]\x1b[0m')
      })

      socket.on('connect_error', (err) => {
        console.error('[Terminal] Connection error:', err)
        setError('Failed to connect to terminal server')
        setIsLoading(false)
      })

      // Handle user input
      xterm.onData((data: string) => {
        if (socketRef.current && sessionIdRef.current) {
          // Encode to base64 with proper UTF-8 handling
          const bytes = new TextEncoder().encode(data)
          const binaryString = Array.from(bytes, byte => String.fromCharCode(byte)).join('')
          const encoded = btoa(binaryString)
          socketRef.current.emit('terminal:input', { sessionId: sessionIdRef.current, data: encoded })
        }
      })

      // Listen for resize
      window.addEventListener('resize', handleResize)
    }

    initTerminal()

    return () => {
      mounted = false
      window.removeEventListener('resize', handleResize)

      if (socketRef.current && sessionIdRef.current) {
        socketRef.current.emit('terminal:disconnect', sessionIdRef.current)
        socketRef.current.disconnect()
      }

      if (xterm) {
        xterm.dispose()
      }
    }
  }, [containerId, handleResize])

  const handleClose = () => {
    if (socketRef.current && sessionIdRef.current) {
      socketRef.current.emit('terminal:disconnect', sessionIdRef.current)
    }
    onClose?.()
  }

  return (
    <div className={clsx('terminal-container flex flex-col', className)}>
      {/* Header */}
      <div className="bg-terminal-bgLight px-4 py-2 flex items-center justify-between rounded-t-lg border-b border-terminal-border">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <button
              onClick={handleClose}
              className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-600 transition-colors"
              title="Close"
            />
            <div className="w-3 h-3 rounded-full bg-yellow-500" />
            <div className="w-3 h-3 rounded-full bg-green-500" />
          </div>
          <span className="text-sm text-terminal-textMuted ml-2 font-mono">
            Terminal {sessionId ? `(${sessionId.substring(0, 8)})` : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isLoading && (
            <span className="text-xs text-yellow-400">Connecting...</span>
          )}
          {isConnected && (
            <span className="text-xs text-green-400 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              Connected
            </span>
          )}
          {error && !isConnected && (
            <span className="text-xs text-red-400">{error}</span>
          )}
        </div>
      </div>

      {/* Terminal */}
      <div
        ref={terminalRef}
        className="flex-1 bg-[#1e1e1e] rounded-b-lg overflow-hidden"
        style={{ minHeight: '400px', padding: '8px' }}
      />
    </div>
  )
}
