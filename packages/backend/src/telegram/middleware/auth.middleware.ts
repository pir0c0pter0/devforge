import { BotContext } from '../telegram.types'
import { logger } from '../../utils/logger'

/**
 * Telegram bot authentication middleware
 *
 * Validates user ID against a whitelist of allowed users.
 * In development mode (empty whitelist), all users are allowed.
 *
 * @param allowedUsers - Array of allowed Telegram user IDs
 * @returns Telegraf middleware function
 */
export function authMiddleware(allowedUsers: number[]) {
  // Create child logger for auth middleware
  const authLogger = logger.child({ middleware: 'auth' })

  return async (ctx: BotContext, next: () => Promise<void>) => {
    const userId = ctx.from?.id
    const username = ctx.from?.username
    const firstName = ctx.from?.first_name

    // Cannot identify user
    if (!userId) {
      authLogger.warn({ update: ctx.update }, 'Requisicao sem identificacao de usuario')
      await ctx.reply('Nao foi possivel identificar seu usuario.')
      return
    }

    // Dev mode: empty list allows everyone
    if (allowedUsers.length === 0) {
      authLogger.debug(
        { userId, username, firstName },
        'Modo desenvolvimento: acesso permitido (lista vazia)'
      )
      return next()
    }

    // Check if user is in whitelist
    if (!allowedUsers.includes(userId)) {
      // Audit log for unauthorized access attempt
      authLogger.warn(
        {
          userId,
          username,
          firstName,
          lastName: ctx.from?.last_name,
          languageCode: ctx.from?.language_code,
          chatType: ctx.chat?.type,
          messageText: 'text' in (ctx.message ?? {}) ? (ctx.message as { text?: string }).text : undefined,
        },
        'Tentativa de acesso nao autorizado'
      )

      await ctx.reply(
        'Voce nao tem permissao para usar este bot.\n\n' +
        'Se voce acredita que isso e um erro, entre em contato com o administrador.'
      )
      return
    }

    // Authorized user
    authLogger.debug({ userId, username }, 'Acesso autorizado')
    return next()
  }
}

/**
 * Parse allowed users from environment variable
 *
 * @param envVar - Comma-separated string of user IDs (e.g., "123456,789012")
 * @returns Array of user IDs as numbers
 */
export function parseAllowedUsers(envVar?: string): number[] {
  if (!envVar || envVar.trim() === '') {
    return []
  }

  return envVar
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id !== '')
    .map((id) => parseInt(id, 10))
    .filter((id) => !isNaN(id) && id > 0)
}
