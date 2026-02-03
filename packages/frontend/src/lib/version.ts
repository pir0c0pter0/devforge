/**
 * Sistema de versionamento do claude-docker-web
 *
 * Formato: MAJOR.MINOR.PATCH[-STAGE]
 * - MAJOR: Mudanças incompatíveis com versões anteriores
 * - MINOR: Novas funcionalidades compatíveis
 * - PATCH: Correções de bugs
 * - STAGE: alpha, beta, rc (release candidate), ou vazio para release final
 *
 * Histórico:
 * - 0.0.1-alpha: Versão inicial de desenvolvimento
 */

export const VERSION = {
  major: 0,
  minor: 0,
  patch: 31,
  stage: 'alpha', // 'alpha' | 'beta' | 'rc' | ''
} as const

export const VERSION_STRING = `${VERSION.major}.${VERSION.minor}.${VERSION.patch}${VERSION.stage ? `-${VERSION.stage}` : ''}`

export const APP_AUTHOR = 'MJr'

export const APP_INFO = {
  name: 'claude-docker-web',
  version: VERSION_STRING,
  author: APP_AUTHOR,
  fullName: `claude-docker-web v${VERSION_STRING} by ${APP_AUTHOR}`,
}
