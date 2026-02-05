import { Request, Response, NextFunction } from 'express'
import jwt, { JwtPayload } from 'jsonwebtoken'
import { logger } from '../utils/logger'

/**
 * Get JWT_SECRET from environment
 * Returns null if not configured (auth disabled for development)
 */
const getJwtSecret = (): string | null => {
  return process.env['JWT_SECRET'] || null
}

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string
    email?: string
    role?: string
  }
}

interface TokenPayload extends JwtPayload {
  id: string
  email?: string
  role?: string
}

/**
 * Middleware de autenticação JWT
 * Valida token Bearer no header Authorization
 */
export const authenticateJWT = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  const jwtSecret = getJwtSecret()

  // If JWT_SECRET is not configured, allow anonymous access (development mode)
  if (!jwtSecret) {
    logger.debug('[Auth] JWT_SECRET not configured, allowing anonymous access')
    next()
    return
  }

  const authHeader = req.headers['authorization']

  if (!authHeader) {
    res.status(401).json({
      success: false,
      error: 'Authentication required',
      code: 'AUTH_REQUIRED'
    })
    return
  }

  const parts = authHeader.split(' ')
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    res.status(401).json({
      success: false,
      error: 'Invalid authorization format. Use: Bearer <token>',
      code: 'INVALID_AUTH_FORMAT'
    })
    return
  }

  const token = parts[1]
  if (!token) {
    res.status(401).json({
      success: false,
      error: 'Token is required',
      code: 'TOKEN_REQUIRED'
    })
    return
  }

  try {
    const decoded = jwt.verify(token, jwtSecret!) as TokenPayload

    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role
    }

    logger.debug({ userId: decoded.id }, 'JWT authentication successful')
    next()
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        success: false,
        error: 'Token expired',
        code: 'TOKEN_EXPIRED'
      })
      return
    }

    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        success: false,
        error: 'Invalid token',
        code: 'INVALID_TOKEN'
      })
      return
    }

    logger.error({ error }, 'JWT verification failed')
    res.status(500).json({
      success: false,
      error: 'Authentication error',
      code: 'AUTH_ERROR'
    })
  }
}

/**
 * Middleware opcional - não bloqueia se não autenticado
 * Útil para endpoints que funcionam com ou sem auth
 */
export const optionalAuth = (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void => {
  const jwtSecret = getJwtSecret()

  const authHeader = req.headers['authorization']
  if (!authHeader) {
    next()
    return
  }

  // Tenta autenticar mas não falha se inválido
  const parts = authHeader.split(' ')
  if (parts.length === 2 && parts[0] === 'Bearer') {
    const token = parts[1]
    if (token) {
      try {
        const decoded = jwt.verify(token, jwtSecret!) as TokenPayload
        req.user = {
          id: decoded.id,
          email: decoded.email,
          role: decoded.role
        }
      } catch {
        // Ignora erro - auth é opcional
      }
    }
  }

  next()
}

/**
 * Middleware para verificar role específica
 */
export const requireRole = (role: string) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      })
      return
    }

    if (req.user.role !== role && req.user.role !== 'admin') {
      res.status(403).json({
        success: false,
        error: `Role '${role}' required`,
        code: 'INSUFFICIENT_PERMISSIONS'
      })
      return
    }

    next()
  }
}

/**
 * Gera um token JWT (útil para testes e setup inicial)
 * Throws error if JWT_SECRET is not configured
 */
export const generateToken = (
  payload: {
    id: string
    email?: string
    role?: string
  },
  expiresIn: string = '24h'
): string => {
  const jwtSecret = getJwtSecret()
  if (!jwtSecret) {
    throw new Error('Cannot generate token: JWT_SECRET is not configured')
  }
  return jwt.sign(payload, jwtSecret, { expiresIn } as jwt.SignOptions)
}

/**
 * Middleware para WebSocket authentication
 * Retorna payload decodificado ou null se inválido
 */
export const authenticateWebSocket = (
  token: string
): { id: string; email?: string; role?: string } | null => {
  const jwtSecret = getJwtSecret()

  // If JWT_SECRET is not configured, return null (auth disabled)
  if (!jwtSecret) {
    return null
  }

  try {
    const decoded = jwt.verify(token, jwtSecret) as TokenPayload

    return {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role
    }
  } catch {
    return null
  }
}
