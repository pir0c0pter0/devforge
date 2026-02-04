/**
 * PII Sanitization Utilities
 *
 * Functions to sanitize Personally Identifiable Information (PII)
 * before logging to prevent data leakage.
 */

/**
 * User information that may contain PII
 */
export interface UserInfo {
  id?: number
  username?: string
  firstName?: string
  lastName?: string
}

/**
 * Sanitized user information safe for logging
 */
export interface SanitizedUserInfo {
  userId: number | undefined
  usernamePrefix: string | undefined
  hasFirstName: boolean
  hasLastName?: boolean
}

/**
 * Sanitize user information for safe logging
 *
 * - User ID is preserved (needed for debugging)
 * - Username is truncated to first 2 chars + asterisks
 * - Names are converted to boolean flags
 *
 * @param user - User information to sanitize
 * @returns Sanitized user info safe for logs
 *
 * @example
 * sanitizeUserForLogs({ id: 123, username: 'johndoe', firstName: 'John' })
 * // Returns: { userId: 123, usernamePrefix: 'jo***', hasFirstName: true }
 */
export function sanitizeUserForLogs(user: UserInfo): SanitizedUserInfo {
  return {
    userId: user.id,
    usernamePrefix: user.username
      ? user.username.slice(0, 2) + '***'
      : undefined,
    hasFirstName: !!user.firstName,
    hasLastName: !!user.lastName,
  }
}

/**
 * Sanitize a string value for logging
 * Shows only first N characters followed by asterisks
 *
 * @param value - String to sanitize
 * @param visibleChars - Number of characters to keep visible (default: 2)
 * @returns Sanitized string or undefined
 */
export function sanitizeString(
  value: string | undefined,
  visibleChars = 2
): string | undefined {
  if (!value) return undefined
  if (value.length <= visibleChars) return '***'
  return value.slice(0, visibleChars) + '***'
}

/**
 * Sanitize an email address for logging
 * Shows only first 2 chars of local part
 *
 * @param email - Email to sanitize
 * @returns Sanitized email or undefined
 *
 * @example
 * sanitizeEmail('john.doe@example.com')
 * // Returns: 'jo***@***'
 */
export function sanitizeEmail(email: string | undefined): string | undefined {
  if (!email) return undefined
  const [local] = email.split('@')
  if (!local) return '***@***'
  return (local.length > 2 ? local.slice(0, 2) : local) + '***@***'
}
