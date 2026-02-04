/**
 * MarkdownV2 formatter utilities for Telegram Bot
 *
 * Telegram MarkdownV2 requires escaping these special characters:
 * _ * [ ] ( ) ~ ` > # + - = | { } . !
 *
 * @see https://core.telegram.org/bots/api#markdownv2-style
 */

/**
 * Characters that must be escaped in MarkdownV2
 */
const SPECIAL_CHARS = /[_*[\]()~`>#+\-=|{}.!\\]/g

/**
 * Container status emojis
 */
const STATUS_EMOJIS: Record<string, string> = {
  running: '\u{1F7E2}', // Green circle
  stopped: '\u{1F534}', // Red circle
  created: '\u{1F7E1}', // Yellow circle
  creating: '\u{1F7E1}', // Yellow circle
  error: '\u{26A0}\u{FE0F}', // Warning sign
  paused: '\u{23F8}\u{FE0F}', // Pause button
  exited: '\u{1F7E0}', // Orange circle
  restarting: '\u{1F504}', // Arrows circle
}

/**
 * Progress bar characters
 */
const PROGRESS_FILLED = '\u2588' // Full block
const PROGRESS_EMPTY = '\u2591' // Light shade

/**
 * MarkdownV2 formatter utilities
 */
export const markdown = {
  /**
   * Escape special characters for MarkdownV2
   *
   * @param text - Text to escape
   * @returns Escaped text safe for MarkdownV2
   */
  escape(text: string): string {
    if (!text) return ''
    return String(text).replace(SPECIAL_CHARS, '\\$&')
  },

  /**
   * Format text as bold
   *
   * @param text - Text to make bold (will be escaped)
   * @returns Bold formatted text
   */
  bold(text: string): string {
    return `*${this.escape(text)}*`
  },

  /**
   * Format text as italic
   *
   * @param text - Text to make italic (will be escaped)
   * @returns Italic formatted text
   */
  italic(text: string): string {
    return `_${this.escape(text)}_`
  },

  /**
   * Format text as inline code
   *
   * @param text - Text to format as code
   * @returns Code formatted text
   */
  code(text: string): string {
    // In code, only ` and \ need escaping
    const escaped = String(text || '').replace(/[`\\]/g, '\\$&')
    return `\`${escaped}\``
  },

  /**
   * Format text as code block
   *
   * @param text - Text to format as code block
   * @param language - Optional language for syntax highlighting
   * @returns Code block formatted text
   */
  codeBlock(text: string, language?: string): string {
    // In code blocks, only ``` and \ need escaping
    const escaped = String(text || '').replace(/```/g, '\\`\\`\\`')
    if (language) {
      return `\`\`\`${language}\n${escaped}\n\`\`\``
    }
    return `\`\`\`\n${escaped}\n\`\`\``
  },

  /**
   * Format text as a hyperlink
   *
   * @param text - Link text (will be escaped)
   * @param url - URL (will be escaped for parentheses)
   * @returns Hyperlink formatted text
   */
  link(text: string, url: string): string {
    const escapedText = this.escape(text)
    // In URLs inside links, only ) and \ need escaping
    const escapedUrl = url.replace(/[)\\]/g, '\\$&')
    return `[${escapedText}](${escapedUrl})`
  },

  /**
   * Format items as a bulleted list
   *
   * @param items - Array of items (will be escaped)
   * @returns Bulleted list formatted text
   */
  list(items: string[]): string {
    if (!items || items.length === 0) return ''
    return items.map((item) => `\u2022 ${this.escape(item)}`).join('\n')
  },

  /**
   * Format items as a numbered list
   *
   * @param items - Array of items (will be escaped)
   * @returns Numbered list formatted text
   */
  numberedList(items: string[]): string {
    if (!items || items.length === 0) return ''
    return items
      .map((item, index) => `${index + 1}\\. ${this.escape(item)}`)
      .join('\n')
  },

  /**
   * Get status emoji and text for container status
   *
   * @param status - Container status
   * @returns Status with emoji
   */
  status(
    status: 'running' | 'stopped' | 'creating' | 'error' | 'created' | 'paused' | 'exited' | 'restarting'
  ): string {
    const emoji = STATUS_EMOJIS[status] || '\u2753' // Question mark for unknown
    const statusText = status.charAt(0).toUpperCase() + status.slice(1)
    return `${emoji} ${this.escape(statusText)}`
  },

  /**
   * Create a visual progress bar
   *
   * @param percent - Progress percentage (0-100)
   * @param width - Width in characters (default: 10)
   * @returns Visual progress bar string
   */
  progressBar(percent: number, width: number = 10): string {
    const safePercent = Math.max(0, Math.min(100, percent || 0))
    const filled = Math.round((safePercent / 100) * width)
    const empty = width - filled

    return PROGRESS_FILLED.repeat(filled) + PROGRESS_EMPTY.repeat(empty)
  },

  /**
   * Format bytes to human-readable string
   *
   * @param bytes - Number of bytes
   * @returns Human-readable size string (e.g., "1.5GB")
   */
  formatBytes(bytes: number): string {
    if (bytes === 0) return '0B'

    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const base = 1024
    const exponent = Math.min(
      Math.floor(Math.log(Math.abs(bytes)) / Math.log(base)),
      units.length - 1
    )
    const value = bytes / Math.pow(base, exponent)

    // Use 2 decimal places for GB and above, 1 for MB, 0 for smaller
    const decimals = exponent >= 3 ? 2 : exponent >= 2 ? 1 : 0
    return `${value.toFixed(decimals)}${units[exponent]}`
  },

  /**
   * Format duration in milliseconds to human-readable string
   *
   * @param ms - Duration in milliseconds
   * @returns Human-readable duration (e.g., "2d 5h 32m")
   */
  formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`

    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    const parts: string[] = []

    if (days > 0) parts.push(`${days}d`)
    if (hours % 24 > 0) parts.push(`${hours % 24}h`)
    if (minutes % 60 > 0) parts.push(`${minutes % 60}m`)
    if (seconds % 60 > 0 && days === 0) parts.push(`${seconds % 60}s`)

    return parts.length > 0 ? parts.join(' ') : '0s'
  },

  /**
   * Format cost in USD
   *
   * @param usd - Cost in USD
   * @returns Formatted cost string (e.g., "$0.47")
   */
  formatCost(usd: number): string {
    if (usd === 0) return '$0.00'

    // Use more precision for small amounts
    if (usd < 0.01) {
      return `$${usd.toFixed(4)}`
    }
    return `$${usd.toFixed(2)}`
  },

  /**
   * Format a number with thousand separators
   *
   * @param num - Number to format
   * @returns Formatted number string
   */
  formatNumber(num: number): string {
    return num.toLocaleString('en-US')
  },

  /**
   * Truncate text to a maximum length
   *
   * @param text - Text to truncate
   * @param maxLength - Maximum length (default: 100)
   * @returns Truncated text with ellipsis if needed
   */
  truncate(text: string, maxLength: number = 100): string {
    if (!text || text.length <= maxLength) return text
    return text.slice(0, maxLength - 3) + '...'
  },
}
