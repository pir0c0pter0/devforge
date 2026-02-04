/**
 * Inline keyboard builders for Telegram Bot
 *
 * Builds InlineKeyboardMarkup objects for interactive Telegram messages
 * using callback_data for button actions.
 */

import { Markup } from 'telegraf'
import type { InlineKeyboardMarkup, InlineKeyboardButton } from 'telegraf/types'
import type { Container } from '@claude-docker/shared'

/**
 * Callback data separator
 */
const SEPARATOR = ':'

/**
 * Build a callback data string
 *
 * @param action - Action identifier
 * @param args - Additional arguments
 * @returns Formatted callback data string
 */
function buildCallbackData(action: string, ...args: string[]): string {
  // Telegram callback_data has a 64 byte limit
  const data = [action, ...args].join(SEPARATOR)
  if (data.length > 64) {
    throw new Error(`Callback data too long: ${data.length} bytes (max 64)`)
  }
  return data
}

/**
 * Keyboard builders for Telegram Bot
 */
export const keyboard = {
  /**
   * Build container selection keyboard
   *
   * @param containers - Array of containers to display
   * @returns InlineKeyboardMarkup for container selection
   */
  containerSelect(containers: Container[]): InlineKeyboardMarkup {
    if (!containers || containers.length === 0) {
      return Markup.inlineKeyboard([
        [Markup.button.callback('\u{2795} Criar Container', 'create:new')],
      ]).reply_markup
    }

    const buttons: InlineKeyboardButton[][] = []

    // Container buttons (2 per row)
    for (let i = 0; i < containers.length; i += 2) {
      const row: InlineKeyboardButton[] = []

      // First container in row
      const c1 = containers[i]
      if (c1) {
        const icon1 = c1.status === 'running' ? '\u{1F7E2}' : '\u{1F534}'
        row.push(
          Markup.button.callback(
            `${icon1} ${c1.name}`,
            buildCallbackData('select', c1.id)
          )
        )
      }

      // Second container in row (if exists)
      const c2 = containers[i + 1]
      if (c2) {
        const icon2 = c2.status === 'running' ? '\u{1F7E2}' : '\u{1F534}'
        row.push(
          Markup.button.callback(
            `${icon2} ${c2.name}`,
            buildCallbackData('select', c2.id)
          )
        )
      }

      if (row.length > 0) {
        buttons.push(row)
      }
    }

    // Add create button at the bottom
    buttons.push([
      Markup.button.callback('\u{2795} Criar Container', 'create:new'),
    ])

    return Markup.inlineKeyboard(buttons).reply_markup
  },

  /**
   * Build container actions keyboard
   *
   * @param containerId - Container ID
   * @param status - Current container status
   * @returns InlineKeyboardMarkup for container actions
   */
  containerActions(
    containerId: string,
    status: 'running' | 'stopped' | 'created' | 'error' = 'stopped'
  ): InlineKeyboardMarkup {
    const buttons: InlineKeyboardButton[][] = []

    if (status === 'running') {
      // Actions for running container
      buttons.push([
        Markup.button.callback(
          '\u{1F4CA} Stats',
          buildCallbackData('action', 'stats', containerId)
        ),
        Markup.button.callback(
          '\u{1F4CB} Fila',
          buildCallbackData('action', 'queue', containerId)
        ),
      ])
      buttons.push([
        Markup.button.callback(
          '\u{23F9} Parar',
          buildCallbackData('confirm', 'stop', containerId)
        ),
        Markup.button.callback(
          '\u{1F504} Restart',
          buildCallbackData('confirm', 'restart', containerId)
        ),
      ])
    } else {
      // Actions for stopped container
      buttons.push([
        Markup.button.callback(
          '\u{25B6}\u{FE0F} Iniciar',
          buildCallbackData('action', 'start', containerId)
        ),
        Markup.button.callback(
          '\u{1F5D1} Excluir',
          buildCallbackData('confirm', 'delete', containerId)
        ),
      ])
    }

    // Back button
    buttons.push([
      Markup.button.callback('\u{2B05} Voltar', 'back:list'),
    ])

    return Markup.inlineKeyboard(buttons).reply_markup
  },

  /**
   * Build queue control keyboard
   *
   * @param containerId - Container ID
   * @param isPaused - Whether the queue is currently paused
   * @returns InlineKeyboardMarkup for queue control
   */
  queueControl(containerId: string, isPaused: boolean = false): InlineKeyboardMarkup {
    const buttons: InlineKeyboardButton[][] = []

    // Pause/Resume button
    if (isPaused) {
      buttons.push([
        Markup.button.callback(
          '\u{25B6}\u{FE0F} Resumir Fila',
          buildCallbackData('queue', 'resume', containerId)
        ),
      ])
    } else {
      buttons.push([
        Markup.button.callback(
          '\u{23F8} Pausar Fila',
          buildCallbackData('queue', 'pause', containerId)
        ),
      ])
    }

    // Clear and refresh buttons
    buttons.push([
      Markup.button.callback(
        '\u{1F5D1} Limpar',
        buildCallbackData('confirm', 'clear_queue', containerId)
      ),
      Markup.button.callback(
        '\u{1F504} Atualizar',
        buildCallbackData('queue', 'refresh', containerId)
      ),
    ])

    // Back button
    buttons.push([
      Markup.button.callback(
        '\u{2B05} Voltar',
        buildCallbackData('select', containerId)
      ),
    ])

    return Markup.inlineKeyboard(buttons).reply_markup
  },

  /**
   * Build confirmation keyboard
   *
   * @param action - Action to confirm
   * @param data - Additional data to pass on confirmation
   * @returns InlineKeyboardMarkup for confirmation
   */
  confirm(action: string, data: string): InlineKeyboardMarkup {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback(
          '\u{2705} Confirmar',
          buildCallbackData('do', action, data)
        ),
        Markup.button.callback('\u{274C} Cancelar', 'cancel'),
      ],
    ]).reply_markup
  },

  /**
   * Build pagination keyboard
   *
   * @param current - Current page (1-indexed)
   * @param total - Total number of pages
   * @param prefix - Callback prefix for page navigation
   * @returns InlineKeyboardMarkup for pagination
   */
  pagination(current: number, total: number, prefix: string): InlineKeyboardMarkup {
    const buttons: InlineKeyboardButton[] = []

    // Previous button
    if (current > 1) {
      buttons.push(
        Markup.button.callback(
          '\u{25C0} Anterior',
          buildCallbackData(prefix, 'page', String(current - 1))
        )
      )
    }

    // Page indicator
    buttons.push(
      Markup.button.callback(
        `${current}/${total}`,
        'noop' // No operation button for display only
      )
    )

    // Next button
    if (current < total) {
      buttons.push(
        Markup.button.callback(
          'Próximo \u{25B6}',
          buildCallbackData(prefix, 'page', String(current + 1))
        )
      )
    }

    return Markup.inlineKeyboard([buttons]).reply_markup
  },

  /**
   * Build job actions keyboard
   *
   * @param containerId - Container ID
   * @param jobId - Job ID
   * @param status - Job status
   * @returns InlineKeyboardMarkup for job actions
   */
  jobActions(
    containerId: string,
    jobId: string,
    status: 'waiting' | 'active' | 'completed' | 'failed'
  ): InlineKeyboardMarkup {
    const buttons: InlineKeyboardButton[][] = []

    if (status === 'waiting') {
      // Can cancel waiting jobs
      buttons.push([
        Markup.button.callback(
          '\u{274C} Cancelar',
          buildCallbackData('job', 'cancel', containerId, jobId)
        ),
      ])
    } else if (status === 'failed') {
      // Can retry failed jobs
      buttons.push([
        Markup.button.callback(
          '\u{1F504} Retentar',
          buildCallbackData('job', 'retry', containerId, jobId)
        ),
        Markup.button.callback(
          '\u{1F5D1} Remover',
          buildCallbackData('job', 'remove', containerId, jobId)
        ),
      ])
    } else if (status === 'completed') {
      // Can remove completed jobs
      buttons.push([
        Markup.button.callback(
          '\u{1F5D1} Remover',
          buildCallbackData('job', 'remove', containerId, jobId)
        ),
      ])
    }

    // Back to queue
    buttons.push([
      Markup.button.callback(
        '\u{2B05} Voltar à Fila',
        buildCallbackData('queue', 'refresh', containerId)
      ),
    ])

    return Markup.inlineKeyboard(buttons).reply_markup
  },

  /**
   * Build mode selection keyboard for new containers
   *
   * @returns InlineKeyboardMarkup for mode selection
   */
  modeSelect(): InlineKeyboardMarkup {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback(
          '\u{1F916} Autônomo',
          buildCallbackData('create', 'mode', 'autonomous')
        ),
        Markup.button.callback(
          '\u{1F464} Interativo',
          buildCallbackData('create', 'mode', 'interactive')
        ),
      ],
      [Markup.button.callback('\u{274C} Cancelar', 'cancel')],
    ]).reply_markup
  },

  /**
   * Build template selection keyboard
   *
   * @returns InlineKeyboardMarkup for template selection
   */
  templateSelect(): InlineKeyboardMarkup {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback(
          '\u{1F9E0} Claude Code',
          buildCallbackData('create', 'template', 'claude')
        ),
      ],
      [
        Markup.button.callback(
          '\u{1F4BB} VS Code',
          buildCallbackData('create', 'template', 'vscode')
        ),
      ],
      [
        Markup.button.callback(
          '\u{1F504} Ambos',
          buildCallbackData('create', 'template', 'both')
        ),
      ],
      [Markup.button.callback('\u{274C} Cancelar', 'cancel')],
    ]).reply_markup
  },

  /**
   * Build a simple close/dismiss keyboard
   *
   * @returns InlineKeyboardMarkup with close button
   */
  close(): InlineKeyboardMarkup {
    return Markup.inlineKeyboard([
      [Markup.button.callback('\u{274C} Fechar', 'close')],
    ]).reply_markup
  },

  /**
   * Build help menu keyboard
   *
   * @returns InlineKeyboardMarkup for help navigation
   */
  helpMenu(): InlineKeyboardMarkup {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback(
          '\u{1F4E6} Containers',
          buildCallbackData('help', 'containers')
        ),
        Markup.button.callback(
          '\u{2699}\u{FE0F} Comandos',
          buildCallbackData('help', 'commands')
        ),
      ],
      [
        Markup.button.callback(
          '\u{1F916} Claude',
          buildCallbackData('help', 'claude')
        ),
        Markup.button.callback(
          '\u{2753} FAQ',
          buildCallbackData('help', 'faq')
        ),
      ],
    ]).reply_markup
  },
}

/**
 * Parse callback data string
 *
 * @param data - Callback data string
 * @returns Parsed parts array
 */
export function parseCallbackData(data: string): string[] {
  return data.split(SEPARATOR)
}
