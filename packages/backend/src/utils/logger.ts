import pino from 'pino';
import pinoHttp from 'pino-http';

/**
 * Environment-based log level
 */
const getLogLevel = (): pino.Level => {
  const level = process.env['LOG_LEVEL']?.toLowerCase();
  const validLevels: pino.Level[] = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'];

  if (level && validLevels.includes(level as pino.Level)) {
    return level as pino.Level;
  }

  return process.env['NODE_ENV'] === 'production' ? 'info' : 'debug';
};

/**
 * Pino logger configuration
 */
const loggerConfig: pino.LoggerOptions = {
  level: getLogLevel(),
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(process.env['NODE_ENV'] !== 'production' && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    },
  }),
};

/**
 * Main application logger
 */
export const logger = pino(loggerConfig);

/**
 * HTTP request logger middleware
 */
export const httpLogger = pinoHttp({
  logger,
  customLogLevel: (_req, res, err) => {
    if (res.statusCode >= 500 || err) {
      return 'error';
    }
    if (res.statusCode >= 400) {
      return 'warn';
    }
    return 'info';
  },
  customSuccessMessage: (_req, res) => {
    return `${_req.method} ${_req.url} - ${res.statusCode}`;
  },
  customErrorMessage: (req, res, err) => {
    return `${req.method} ${req.url} - ${res.statusCode} - ${err.message}`;
  },
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      query: req.query,
      params: req.params,
      headers: {
        host: req.headers.host,
        userAgent: req.headers['user-agent'],
      },
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },
});

/**
 * Create child logger with additional context
 */
export const createChildLogger = (context: Record<string, unknown>) => {
  return logger.child(context);
};

/**
 * Structured logging helpers
 */
export const logError = (error: Error, context?: Record<string, unknown>) => {
  logger.error({
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name,
    },
    ...context,
  }, 'Error occurred');
};

export const logInfo = (message: string, context?: Record<string, unknown>) => {
  logger.info(context, message);
};

export const logWarn = (message: string, context?: Record<string, unknown>) => {
  logger.warn(context, message);
};

export const logDebug = (message: string, context?: Record<string, unknown>) => {
  logger.debug(context, message);
};

/**
 * Docker operation logger
 */
export const dockerLogger = createChildLogger({ service: 'docker' });

/**
 * Container service logger
 */
export const containerLogger = createChildLogger({ service: 'container' });

/**
 * Metrics service logger
 */
export const metricsLogger = createChildLogger({ service: 'metrics' });

/**
 * Queue service logger
 */
export const queueLogger = createChildLogger({ service: 'queue' });

/**
 * API logger
 */
export const apiLogger = createChildLogger({ service: 'api' });
