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
 * Claude CLI base flags for Telegram conversations
 * Note: prompt is passed as positional argument, not as --prompt
 * Note: Claude CLI requires TTY emulation via 'script' command to avoid
 *       stdout buffering issues when spawned as child process
 */
const CLAUDE_FLAGS_BASE = [
  '--print',
  '--dangerously-skip-permissions',
]

/**
 * Hard timeout for Claude CLI process in Telegram (2 minutes)
 * Telegram responses should be fast
 */
const TELEGRAM_PROCESS_TIMEOUT = 2 * 60 * 1000

/**
 * System prompt for Telegram assistant
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
      // Pure UUID for Claude CLI (it validates UUID format)
      // Isolation is handled by separate in-memory Maps per service
      session = {
        sessionId: randomUUID(),
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
      // Build command arguments for Claude
      const claudeArgs = [...CLAUDE_FLAGS_BASE]

      // Track if this is first message (for output parsing)
      const isFirstMessage = session.isFirstMessage

      // Use session for continuity
      if (isFirstMessage) {
        claudeArgs.push('--session-id', session.sessionId)
        // Add system prompt on first message
        claudeArgs.push('--system-prompt', TELEGRAM_SYSTEM_PROMPT)
        session.isFirstMessage = false
      } else {
        claudeArgs.push('--resume', session.sessionId)
      }

      // Add the message as positional argument (must be last)
      // No shell escaping needed - arguments passed directly to spawn
      claudeArgs.push(message)

      logger.debug({ args: claudeArgs }, 'Spawning Claude CLI via script')

      // Use 'script' to emulate a TTY - this fixes stdout buffering issues
      // script -q /dev/null claude [args] runs command in a PTY and outputs to stdout
      // Using '--' to separate script options from the command
      const scriptArgs = ['-q', '/dev/null', '--', 'claude', ...claudeArgs]

      const proc = spawn('script', scriptArgs, {
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

        // Parse the output to extract the response
        // First message returns plain text, subsequent messages return JSON
        const response = this.parseClaudeOutput(stdout, isFirstMessage)

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
   * Strip ANSI escape codes and terminal control sequences from output
   * These are added by 'script' command when emulating TTY
   */
  private stripAnsiCodes(text: string): string {
    return text
      // Remove ANSI escape sequences (colors, cursor movement, etc.)
      .replace(/\x1b\[[0-9;?]*[a-zA-Z<>]/g, '')
      // Remove OSC sequences (Operating System Commands)
      .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
      // Remove remaining escape sequences
      .replace(/\x1b[<>=A-Za-z]/g, '')
      // Remove control characters
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
      // Remove carriage returns
      .replace(/\r/g, '')
      // Remove leftover bracket sequences like [<u [?1004l [?25h etc
      .replace(/\[<[a-z]/g, '')
      .replace(/\[\?[0-9]*[a-zA-Z]/g, '')
      // Remove trailing single letters that are escape sequence residue (common: u, h, l)
      .replace(/[uhl]\s*$/g, '')
      // Remove "u[" pattern that appears when escape sequence is split
      .replace(/u\[/g, '')
      // Clean up multiple spaces
      .replace(/  +/g, ' ')
      // Clean up multiple newlines
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }

  /**
   * Parse Claude CLI output to extract response text
   * Output comes through 'script' TTY emulation, so may contain escape codes
   */
  private parseClaudeOutput(stdout: string, _isPlainText: boolean): ClaudeResponse {
    // Strip terminal escape codes added by 'script'
    const cleanOutput = this.stripAnsiCodes(stdout)

    return {
      text: cleanOutput || 'Desculpe, nao consegui gerar uma resposta.',
      cost: undefined,
      durationMs: undefined,
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
