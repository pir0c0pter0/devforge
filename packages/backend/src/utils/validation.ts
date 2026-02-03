import { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';
import { logger } from './logger';

/**
 * Validation error response format
 */
interface ValidationErrorResponse {
  success: false;
  error: string;
  details: Array<{
    field: string;
    message: string;
  }>;
}

/**
 * Format Zod validation errors
 */
const formatZodError = (error: ZodError): ValidationErrorResponse => {
  return {
    success: false,
    error: 'Validation failed',
    details: error.errors.map((err) => ({
      field: err.path.join('.'),
      message: err.message,
    })),
  };
};

/**
 * Validate request body against Zod schema
 */
export const validateBody = <T extends z.ZodTypeAny>(schema: T) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validated = await schema.parseAsync(req.body);
      req.body = validated;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        logger.warn({
          path: req.path,
          method: req.method,
          errors: error.errors
        }, 'Request body validation failed');

        res.status(400).json(formatZodError(error));
        return;
      }

      logger.error({ error }, 'Unexpected validation error');
      res.status(500).json({
        success: false,
        error: 'Internal validation error',
      });
    }
  };
};

/**
 * Validate request query parameters against Zod schema
 */
export const validateQuery = <T extends z.ZodTypeAny>(schema: T) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validated = await schema.parseAsync(req.query);
      req.query = validated as any;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        logger.warn({
          path: req.path,
          method: req.method,
          errors: error.errors
        }, 'Query parameters validation failed');

        res.status(400).json(formatZodError(error));
        return;
      }

      logger.error({ error }, 'Unexpected validation error');
      res.status(500).json({
        success: false,
        error: 'Internal validation error',
      });
    }
  };
};

/**
 * Validate request path parameters against Zod schema
 */
export const validateParams = <T extends z.ZodTypeAny>(schema: T) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validated = await schema.parseAsync(req.params);
      req.params = validated as any;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        logger.warn({
          path: req.path,
          method: req.method,
          errors: error.errors
        }, 'Path parameters validation failed');

        res.status(400).json(formatZodError(error));
        return;
      }

      logger.error({ error }, 'Unexpected validation error');
      res.status(500).json({
        success: false,
        error: 'Internal validation error',
      });
    }
  };
};

/**
 * Generic validation function for manual validation
 */
export const validate = async <T extends z.ZodTypeAny>(
  schema: T,
  data: unknown
): Promise<z.infer<T>> => {
  try {
    return await schema.parseAsync(data);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ValidationError('Validation failed', error);
    }
    throw error;
  }
};

/**
 * Custom validation error class
 */
export class ValidationError extends Error {
  public readonly zodError: ZodError;

  constructor(message: string, zodError: ZodError) {
    super(message);
    this.name = 'ValidationError';
    this.zodError = zodError;
  }

  public toResponse(): ValidationErrorResponse {
    return formatZodError(this.zodError);
  }
}

/**
 * Safe parse helper that returns result object
 */
export const safeParse = <T extends z.ZodTypeAny>(
  schema: T,
  data: unknown
): { success: true; data: z.infer<T> } | { success: false; error: ValidationErrorResponse } => {
  try {
    const validated = schema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof ZodError) {
      return { success: false, error: formatZodError(error) };
    }
    return {
      success: false,
      error: {
        success: false,
        error: 'Validation error',
        details: [{ field: 'unknown', message: 'An unexpected error occurred' }],
      },
    };
  }
};
