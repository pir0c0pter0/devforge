import Docker from 'dockerode'
import { v4 as uuidv4 } from 'uuid'
import { dockerLogger as logger } from '../utils/logger'
import { containerRepository } from '../repositories'
import type { TerminalSession } from '@claude-docker/shared'

interface ActiveSession {
  session: TerminalSession
  exec: Docker.Exec
  stream: NodeJS.ReadWriteStream
  onData: (data: string) => void
  onClose: (exitCode: number) => void
  timeout: NodeJS.Timeout
}

const INACTIVITY_TIMEOUT = 15 * 60 * 1000 // 15 minutes
const MAX_SESSIONS_PER_CONTAINER = 5

class TerminalService {
  private docker: Docker
  private sessions: Map<string, ActiveSession> = new Map()
  private cleanupInterval: NodeJS.Timeout | null = null

  constructor() {
    this.docker = new Docker({
      socketPath: process.env['DOCKER_SOCKET_PATH'] || '/var/run/docker.sock',
    })
    this.startCleanupTimer()
  }

  async createSession(
    containerId: string,
    cols: number,
    rows: number,
    onData: (data: string) => void,
    onClose: (exitCode: number) => void
  ): Promise<TerminalSession> {
    // Check session limit
    const containerSessions = Array.from(this.sessions.values())
      .filter(s => s.session.containerId === containerId)

    if (containerSessions.length >= MAX_SESSIONS_PER_CONTAINER) {
      throw new Error(`Maximum sessions (${MAX_SESSIONS_PER_CONTAINER}) reached for container`)
    }

    const sessionId = uuidv4()
    logger.info({ containerId, sessionId, cols, rows }, 'Creating terminal session')

    // Resolve dockerId from internal containerId
    const containerEntity = containerRepository.findById(containerId)
    if (!containerEntity || !containerEntity.dockerId) {
      throw new Error(`Container ${containerId} not found or has no Docker ID`)
    }

    const dockerId = containerEntity.dockerId
    logger.debug({ containerId, dockerId }, 'Resolved Docker ID for terminal')

    const container = this.docker.getContainer(dockerId)

    // Create exec with TTY
    const exec = await container.exec({
      Cmd: ['/bin/bash'],
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
      Env: [
        'TERM=xterm-256color',
        `COLUMNS=${cols}`,
        `LINES=${rows}`,
      ],
    })

    // Start exec with hijack for bidirectional stream
    const stream = await exec.start({
      Tty: true,
      stdin: true,
      hijack: true,
    }) as NodeJS.ReadWriteStream

    const session: TerminalSession = {
      sessionId,
      containerId,
      cols,
      rows,
      createdAt: new Date(),
      lastActivity: new Date(),
      status: 'connected',
    }

    // Handle stream data
    stream.on('data', (chunk: Buffer) => {
      this.updateActivity(sessionId)
      onData(chunk.toString('base64'))
    })

    stream.on('end', () => {
      logger.info({ sessionId }, 'Terminal stream ended')
      this.closeSession(sessionId, 0)
    })

    stream.on('error', (error) => {
      logger.error({ sessionId, error }, 'Terminal stream error')
      this.closeSession(sessionId, 1)
    })

    // Setup inactivity timeout
    const timeout = this.setupInactivityTimeout(sessionId)

    this.sessions.set(sessionId, {
      session,
      exec,
      stream,
      onData,
      onClose,
      timeout,
    })

    logger.info({ sessionId, containerId }, 'Terminal session created')
    return session
  }

  write(sessionId: string, data: string): boolean {
    const activeSession = this.sessions.get(sessionId)
    if (!activeSession) {
      logger.warn({ sessionId }, 'Session not found for write')
      return false
    }

    this.updateActivity(sessionId)

    // Decode base64 input
    const decoded = Buffer.from(data, 'base64')
    return activeSession.stream.write(decoded)
  }

  async resize(sessionId: string, cols: number, rows: number): Promise<void> {
    const activeSession = this.sessions.get(sessionId)
    if (!activeSession) {
      throw new Error(`Session ${sessionId} not found`)
    }

    logger.debug({ sessionId, cols, rows }, 'Resizing terminal')

    await activeSession.exec.resize({ h: rows, w: cols })
    activeSession.session.cols = cols
    activeSession.session.rows = rows
    this.updateActivity(sessionId)
  }

  closeSession(sessionId: string, exitCode: number = 0): void {
    const activeSession = this.sessions.get(sessionId)
    if (!activeSession) return

    logger.info({ sessionId, exitCode }, 'Closing terminal session')

    clearTimeout(activeSession.timeout)

    try {
      // End the stream gracefully
      if (activeSession.stream && typeof activeSession.stream.end === 'function') {
        activeSession.stream.end()
      }
    } catch (e) {
      // Stream may already be closed
    }

    activeSession.onClose(exitCode)
    this.sessions.delete(sessionId)
  }

  getSession(sessionId: string): TerminalSession | undefined {
    return this.sessions.get(sessionId)?.session
  }

  getActiveSessions(): TerminalSession[] {
    return Array.from(this.sessions.values()).map(s => s.session)
  }

  private updateActivity(sessionId: string): void {
    const activeSession = this.sessions.get(sessionId)
    if (activeSession) {
      activeSession.session.lastActivity = new Date()
      // Reset timeout
      clearTimeout(activeSession.timeout)
      activeSession.timeout = this.setupInactivityTimeout(sessionId)
    }
  }

  private setupInactivityTimeout(sessionId: string): NodeJS.Timeout {
    return setTimeout(() => {
      logger.info({ sessionId }, 'Closing inactive terminal session')
      this.closeSession(sessionId, 143) // SIGTERM
    }, INACTIVITY_TIMEOUT)
  }

  private startCleanupTimer(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now()
      for (const [sessionId, activeSession] of this.sessions) {
        const inactiveMs = now - activeSession.session.lastActivity.getTime()
        if (inactiveMs > INACTIVITY_TIMEOUT) {
          logger.info({ sessionId, inactiveMs }, 'Cleaning up inactive session')
          this.closeSession(sessionId, 143)
        }
      }
    }, 60 * 1000) // Check every minute
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
    }
    for (const sessionId of this.sessions.keys()) {
      this.closeSession(sessionId, 143)
    }
  }
}

export const terminalService = new TerminalService()
