import { spawn } from 'child_process'
import { randomUUID } from 'crypto'
import { createChildLogger } from '../../utils/logger'

const logger = createChildLogger({ service: 'telegram-claude-cli' })

/**
 * Session tracking for Telegram users
 */
interface TelegramClaudeSession {
  sessionId: string
  userId: number
  chatId: number
  lastActivity: Date
  isFirstMessage: boolean
}

/**
 * Response from Claude CLI
 */
interface ClaudeResponse {
  text: string
  cost?: number
  durationMs?: number
}

/**
 * Claude CLI flags for Telegram conversations
 * Note: prompt is passed as positional argument, not as --prompt
 * Note: --verbose is required when using --output-format stream-json
 */
const CLAUDE_FLAGS = [
  '--print',
  '--dangerously-skip-permissions',
  '--output-format', 'stream-json',
  '--verbose',
]

/**
 * Hard timeout for Claude CLI process in Telegram (2 minutes)
 * Telegram responses should be fast
 */
const TELEGRAM_PROCESS_TIMEOUT = 2 * 60 * 1000

/**
 * System prompt for Telegram assistant (single line to avoid shell escaping issues)
 */
const TELEGRAM_SYSTEM_PROMPT = 'Voce eh um assistente pessoal amigavel no Telegram. Responda em portugues brasileiro de forma concisa (max 500 chars). Use emojis ocasionalmente. Nao mencione que eh Claude ou Anthropic.'

/**
 * TelegramClaudeService - Uses local Claude Code CLI for Telegram conversations
 *
 * This service uses the Claude Code CLI installed on the host machine,
 * which is already authenticated via the settings page OAuth flow.
 *
 * Each Telegram user gets their own session ID for conversation continuity.
 */
class TelegramClaudeService {
  private sessions: Map<string, TelegramClaudeSession> = new Map()
  private cleanupInterval: NodeJS.Timeout | null = null

  constructor() {
    // Cleanup inactive sessions every 10 minutes
    this.cleanupInterval = setInterval(() => this.cleanupSessions(), 10 * 60 * 1000)
  }

  /**
   * Get session key for a user/chat combination
   */
  private getSessionKey(userId: number, chatId: number): string {
    return `${userId}:${chatId}`
  }

  /**
   * Get or create a session for a user
   */
  private getOrCreateSession(userId: number, chatId: number): TelegramClaudeSession {
    const key = this.getSessionKey(userId, chatId)
    let session = this.sessions.get(key)

    if (!session) {
      // Prefix with 'telegram-{userId}-' to isolate from Container and other services
      session = {
        sessionId: `telegram-${userId}-${randomUUID()}`,
        userId,
        chatId,
        lastActivity: new Date(),
        isFirstMessage: true,
      }
      this.sessions.set(key, session)
      logger.info({ userId, chatId, sessionId: session.sessionId }, 'Created new Claude CLI session')
    }

    session.lastActivity = new Date()
    return session
  }

  /**
   * Check if Claude CLI is available
   */
  async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const proc = spawn('claude', ['--version'], {
        timeout: 5000,
        shell: true,
      })

      proc.on('close', (code) => {
        resolve(code === 0)
      })

      proc.on('error', () => {
        resolve(false)
      })
    })
  }

  /**
   * Send a message to Claude CLI and get a response
   */
  async chat(userId: number, chatId: number, message: string): Promise<ClaudeResponse> {
    const session = this.getOrCreateSession(userId, chatId)

    logger.info(
      { userId, chatId, sessionId: session.sessionId, messageLength: message.length },
      'Sending message to Claude CLI'
    )

    return new Promise((resolve, reject) => {
      // Build command arguments
      const args = [...CLAUDE_FLAGS]

      // Use session for continuity
      if (session.isFirstMessage) {
        args.push('--session-id', session.sessionId)
        // Add system prompt on first message
        args.push('--system-prompt', TELEGRAM_SYSTEM_PROMPT)
        session.isFirstMessage = false
      } else {
        args.push('--resume', session.sessionId)
      }

      // Add the message as positional argument (must be last)
      args.push(message)

      logger.debug({ args: args.join(' ') }, 'Spawning Claude CLI')

      const proc = spawn('claude', args, {
        cwd: process.env['HOME'] || '/tmp', // Use HOME to avoid scanning large codebases
        env: { ...process.env, HOME: process.env['HOME'] },
      })

      let stdout = ''
      let stderr = ''

      // Hard timeout watchdog - kill process if it runs too long
      // Two-stage: SIGTERM first (graceful), then SIGKILL after 5s (force)
      const timeoutId = setTimeout(() => {
        if (proc && !proc.killed) {
          logger.warn(
            { userId, chatId, sessionId: session.sessionId, timeout: TELEGRAM_PROCESS_TIMEOUT },
            'Claude process timeout - sending SIGTERM'
          )
          proc.kill('SIGTERM')
          // If still alive after 5 seconds, force kill
          setTimeout(() => {
            if (proc && !proc.killed) {
              logger.warn(
                { userId, chatId, sessionId: session.sessionId },
                'Claude process still alive after SIGTERM - sending SIGKILL'
              )
              proc.kill('SIGKILL')
            }
          }, 5000)
        }
      }, TELEGRAM_PROCESS_TIMEOUT)

      proc.stdout?.on('data', (data) => {
        stdout += data.toString()
      })

      proc.stderr?.on('data', (data) => {
        stderr += data.toString()
      })

      proc.on('close', (code) => {
        // Clear the hard timeout
        clearTimeout(timeoutId)

        if (code !== 0) {
          logger.error({ code, stderr, userId }, 'Claude CLI exited with error')
          reject(new Error(stderr || `Claude CLI exited with code ${code}`))
          return
        }

        // Parse the stream-json output to extract the response
        const response = this.parseClaudeOutput(stdout)

        logger.info(
          { userId, sessionId: session.sessionId, responseLength: response.text.length },
          'Claude CLI response received'
        )

        resolve(response)
      })

      proc.on('error', (error) => {
        // Clear the hard timeout
        clearTimeout(timeoutId)

        // Kill process if not already killed
        if (proc && !proc.killed) {
          proc.kill('SIGKILL')
        }

        logger.error({ error, userId }, 'Failed to spawn Claude CLI')
        reject(error)
      })
    })
  }

  /**
   * Parse Claude CLI stream-json output to extract response text
   */
  private parseClaudeOutput(stdout: string): ClaudeResponse {
    let responseText = ''
    let cost: number | undefined
    let durationMs: number | undefined

    // Split by newlines and parse each JSON line
    const lines = stdout.split('\n').filter(line => line.trim())

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line)

        // Look for assistant messages
        if (parsed.type === 'assistant' && parsed.message?.content) {
          const content = parsed.message.content
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'text' && block.text) {
                responseText += block.text
              }
            }
          } else if (typeof content === 'string') {
            responseText += content
          }
        }

        // Look for result with cost info
        if (parsed.type === 'result') {
          if (parsed.total_cost_usd) {
            cost = parsed.total_cost_usd
          }
          if (parsed.duration_ms) {
            durationMs = parsed.duration_ms
          }
          // Result might also have the response
          if (parsed.result && typeof parsed.result === 'string') {
            responseText = parsed.result
          }
        }

        // Handle content_block_delta for streaming
        if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
          responseText += parsed.delta.text
        }

      } catch {
        // Not JSON, might be plain text
        if (line.trim() && !line.startsWith('{')) {
          responseText += line + '\n'
        }
      }
    }

    // Fallback: if no parsed response, use raw output
    if (!responseText.trim() && stdout.trim()) {
      // Try to find any text that looks like a response
      const lastLines = stdout.split('\n').slice(-10).join('\n')
      responseText = lastLines
    }

    return {
      text: responseText.trim() || 'Desculpe, nao consegui gerar uma resposta.',
      cost,
      durationMs,
    }
  }

  /**
   * Clear session for a user (e.g., when they use /clear)
   */
  clearSession(userId: number, chatId: number): void {
    const key = this.getSessionKey(userId, chatId)
    const session = this.sessions.get(key)

    if (session) {
      this.sessions.delete(key)
      logger.info({ userId, chatId, sessionId: session.sessionId }, 'Cleared Claude CLI session')
    }
  }

  /**
   * Get session info for a user
   */
  getSession(userId: number, chatId: number): TelegramClaudeSession | undefined {
    const key = this.getSessionKey(userId, chatId)
    return this.sessions.get(key)
  }

  /**
   * Cleanup inactive sessions (older than 1 hour)
   */
  private cleanupSessions(): void {
    const now = new Date()
    const maxAge = 60 * 60 * 1000 // 1 hour

    for (const [key, session] of this.sessions.entries()) {
      const age = now.getTime() - session.lastActivity.getTime()
      if (age > maxAge) {
        this.sessions.delete(key)
        logger.debug({ sessionId: session.sessionId }, 'Cleaned up inactive session')
      }
    }
  }

  /**
   * Shutdown the service
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
  }
}

// Export singleton
export const telegramClaudeService = new TelegramClaudeService()
