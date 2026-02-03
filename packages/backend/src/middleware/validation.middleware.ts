import { Request, Response, NextFunction } from 'express'
import { z, ZodError, ZodSchema } from 'zod'

/**
 * Error response interface
 */
interface ValidationErrorResponse {
  success: false
  error: string
  details?: Array<{
    path: string
    message: string
  }>
}

/**
 * Format Zod validation errors
 */
const formatZodError = (error: ZodError): ValidationErrorResponse => {
  return {
    success: false,
    error: 'Validation failed',
    details: error.errors.map((err) => ({
      path: err.path.join('.'),
      message: err.message,
    })),
  }
}

/**
 * Validate request body against Zod schema
 */
export const validateBody = <T extends ZodSchema>(schema: T) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const validated = schema.parse(req.body)
      req.body = validated
      next()
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json(formatZodError(error))
        return
      }
      res.status(500).json({
        success: false,
        error: 'Internal validation error',
      })
    }
  }
}

/**
 * Validate request params against Zod schema
 */
export const validateParams = <T extends ZodSchema>(schema: T) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const validated = schema.parse(req.params)
      req.params = validated
      next()
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json(formatZodError(error))
        return
      }
      res.status(500).json({
        success: false,
        error: 'Internal validation error',
      })
    }
  }
}

/**
 * Validate request query against Zod schema
 */
export const validateQuery = <T extends ZodSchema>(schema: T) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const validated = schema.parse(req.query)
      req.query = validated as typeof req.query
      next()
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json(formatZodError(error))
        return
      }
      res.status(500).json({
        success: false,
        error: 'Internal validation error',
      })
    }
  }
}

/**
 * Combined validation for body, params, and query
 */
export const validate = <
  TBody extends ZodSchema = z.ZodAny,
  TParams extends ZodSchema = z.ZodAny,
  TQuery extends ZodSchema = z.ZodAny
>(schemas: {
  body?: TBody
  params?: TParams
  query?: TQuery
}) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body)
      }
      if (schemas.params) {
        req.params = schemas.params.parse(req.params)
      }
      if (schemas.query) {
        req.query = schemas.query.parse(req.query) as typeof req.query
      }
      next()
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json(formatZodError(error))
        return
      }
      res.status(500).json({
        success: false,
        error: 'Internal validation error',
      })
    }
  }
}

/**
 * Async error handler middleware
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}
