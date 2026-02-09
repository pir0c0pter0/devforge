import express, { Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { httpLogger, logger } from './utils/logger';
import { containerService } from './services/container.service';
import { dockerService } from './services/docker.service';
import { initializeWebSocket, getSocketServer } from './services/websocket.service';
import { containerLifecycleService } from './services/container-lifecycle.service';
import containersRouter from './api/routes/containers.routes';
import dockerLogsRouter from './api/routes/docker-logs.routes';
import templatesRouter from './api/routes/templates.routes';
import diagnosticsRouter from './api/routes/diagnostics.routes';
import settingsRouter from './api/routes/settings.routes';
import tasksRouter from './api/routes/tasks.routes';
import claudeDaemonRouter from './api/routes/claude-daemon.routes';
import telegramRouter from './api/routes/telegram.routes';
import { initializeDatabase, closeDatabase, isDatabaseHealthy } from './database';
import { runMigrations, getDatabaseStats } from './database/migrations';
import {
  standardRateLimiter,
  rateLimitConfig,
} from './middleware/rate-limit';
import {
  csrfCookieMiddleware,
  csrfValidationMiddleware,
  getCsrfToken,
} from './middleware/csrf.middleware';
import { authenticateJWT, validateAuthConfig } from './middleware/auth.middleware';
import healthRouter from './api/routes/health.routes';
import { destroyAllQueues } from './services/claude-queue.service';
import { stopAllWorkers } from './workers/claude.worker';
import { healthMonitorService } from './services/health-monitor.service';
import { claudeDaemonService } from './services/claude-daemon.service';
import { metricsCollectorService } from './services/metrics-collector.service';
import { usageService } from './services/usage.service';
import { telegramService } from './telegram/telegram.service';
import { dockerLogsCollectorService } from './services/docker-logs-collector.service';

// Load environment variables
dotenv.config();

// Configuration
const PORT = process.env['PORT'] ? parseInt(process.env['PORT'], 10) : 3000;
const HOST = process.env['HOST'] || '0.0.0.0';
const NODE_ENV = process.env['NODE_ENV'] || 'development';

/**
 * Default allowed origins for CORS (used in development)
 */
const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
];

/**
 * Parse ALLOWED_ORIGINS environment variable (comma-separated list)
 */
const parseAllowedOrigins = (value: string | undefined): string[] => {
  if (!value || value === '*') {
    return DEFAULT_ALLOWED_ORIGINS;
  }
  return value.split(',').map((origin) => origin.trim()).filter(Boolean);
};

const ALLOWED_ORIGINS = parseAllowedOrigins(process.env['ALLOWED_ORIGINS']);

/**
 * CORS origin validation function
 * Validates incoming origin against allowed origins list
 */
const corsOriginValidator = (
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void
): void => {
  // Allow requests with no origin (e.g., same-origin, curl, mobile apps)
  if (!origin) {
    callback(null, true);
    return;
  }

  // Check if origin is in the allowed list
  if (ALLOWED_ORIGINS.includes(origin)) {
    callback(null, true);
    return;
  }

  // Log rejected origin for debugging
  logger.warn({ origin, allowedOrigins: ALLOWED_ORIGINS }, 'CORS request from unauthorized origin blocked');
  callback(new Error(`Origin ${origin} not allowed by CORS policy`));
};

/**
 * Initialize Express application
 */
const app: express.Application = express();
const httpServer = createServer(app);

/**
 * Socket.io server instance (initialized in startServer)
 */
let io: ReturnType<typeof initializeWebSocket> | null = null;

/**
 * Middleware
 */
// SEC-H4: Enable CSP and security headers in all environments
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'", 'ws:', 'wss:'],
      frameSrc: ["'self'"],
      fontSrc: ["'self'", 'data:'],
    },
  },
  // Backend is API-only; disable X-Frame-Options to avoid interfering with frontend iframes
  frameguard: false,
  // Disable COEP to allow cross-origin resources (VS Code iframe, etc.)
  crossOriginEmbedderPolicy: false,
}));

// Security headers: deny dangerous browser APIs
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Permissions-Policy', 'usb=(), serial=(), hid=()');
  next();
});

app.use(cors({
  origin: corsOriginValidator,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-CSRF-Token'],
}));

app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(httpLogger);

/**
 * Rate limiting middleware
 * Applied globally with different limits for different operation types
 */
// Apply standard rate limiter globally for all requests
app.use(standardRateLimiter);

// Log rate limit configuration on startup
logger.info({ rateLimitConfig }, 'Rate limiting enabled');

/**
 * CSRF Protection
 * - csrfCookieMiddleware: Sets CSRF token cookie on all requests
 * - csrfValidationMiddleware: Validates CSRF token on state-changing requests (POST, PUT, DELETE, PATCH)
 */
app.use(csrfCookieMiddleware);
app.use(csrfValidationMiddleware);

// Log CSRF protection enabled
logger.info('CSRF protection enabled globally');

/**
 * CSRF Token endpoint
 * Clients can call this to retrieve the current CSRF token
 */
app.get('/api/csrf-token', getCsrfToken);

/**
 * Health check endpoint
 */
app.get('/health', async (_req: Request, res: Response) => {
  try {
    const dockerHealthy = await dockerService.ping();
    const databaseHealthy = isDatabaseHealthy();
    const allHealthy = dockerHealthy && databaseHealthy;

    res.json({
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        docker: dockerHealthy,
        database: databaseHealthy,
        api: true,
      },
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Health routes (no auth required - used for load balancers and k8s probes)
 */
app.use('/api/health', healthRouter);

/**
 * Telegram routes - no JWT authentication required:
 * - /webhook: Called by Telegram servers (has its own secret token validation)
 * - /send-from-container: Called from inside containers (internal)
 * Note: /status, /send, /broadcast still benefit from rate limiting
 */
app.use('/api/telegram', telegramRouter);

/**
 * Protected API routes - require JWT authentication
 * (When JWT_SECRET is not configured, auth is skipped for development)
 */
app.use('/api/containers', authenticateJWT, containersRouter);
app.use('/api/containers', authenticateJWT, dockerLogsRouter);
app.use('/api/templates', authenticateJWT, templatesRouter);
app.use('/api/diagnostics', authenticateJWT, diagnosticsRouter);
app.use('/api/settings', authenticateJWT, settingsRouter);
app.use('/api/tasks', authenticateJWT, tasksRouter);
app.use('/api/claude-daemon', authenticateJWT, claudeDaemonRouter);

// Log JWT authentication enabled
logger.info('JWT authentication enabled on protected routes (disabled if JWT_SECRET not set)');

/**
 * Root endpoint
 */
app.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'DevForge Backend API',
    version: '1.0.0',
    description: 'Docker container management API with Claude Code integration',
    endpoints: {
      health: '/health',
      healthApi: '/api/health',
      containers: '/api/containers',
      templates: '/api/templates',
      diagnostics: '/api/diagnostics',
      settings: '/api/settings',
      tasks: '/api/tasks',
      claudeDaemon: '/api/claude-daemon',
      telegram: '/api/telegram',
    },
    telegramEndpoints: {
      webhook: 'POST /api/telegram/webhook',
      status: 'GET /api/telegram/status',
      sendMessage: 'POST /api/telegram/send',
      broadcast: 'POST /api/telegram/broadcast',
    },
    queueEndpoints: {
      sendInstruction: 'POST /api/claude-daemon/:containerId/instruction',
      getStatus: 'GET /api/claude-daemon/:containerId/queue',
      getHistory: 'GET /api/claude-daemon/:containerId/queue/history',
      getJob: 'GET /api/claude-daemon/:containerId/queue/jobs/:jobId',
      cancelJob: 'POST /api/claude-daemon/:containerId/queue/jobs/:jobId/cancel',
      retryJob: 'POST /api/claude-daemon/:containerId/queue/jobs/:jobId/retry',
      clearQueue: 'DELETE /api/claude-daemon/:containerId/queue',
      pauseQueue: 'POST /api/claude-daemon/:containerId/queue/pause',
      resumeQueue: 'POST /api/claude-daemon/:containerId/queue/resume',
      getDeadLetterQueue: 'GET /api/claude-daemon/:containerId/queue/dlq',
    },
    dockerLogsEndpoints: {
      getLogs: 'GET /api/containers/:id/docker-logs',
      getStats: 'GET /api/containers/:id/docker-logs/stats',
      deleteLogs: 'DELETE /api/containers/:id/docker-logs',
      downloadLogs: 'GET /api/containers/:id/docker-logs/download',
    },
    websocketNamespaces: {
      metrics: '/metrics',
      queue: '/queue',
      logs: '/logs',
      tasks: '/tasks',
      terminal: '/terminal',
      claudeDaemon: '/claude-daemon',
      creation: '/creation',
    },
    authentication: {
      note: 'Most API routes require JWT authentication. Pass Bearer token in Authorization header.',
      publicRoutes: ['/health', '/api/health/*', '/api/csrf-token', '/api/telegram/webhook', '/api/telegram/send-from-container'],
      protectedRoutes: ['/api/containers/*', '/api/templates/*', '/api/diagnostics/*', '/api/settings/*', '/api/tasks/*', '/api/claude-daemon/*'],
    },
  });
});

/**
 * 404 handler
 */
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Not found',
    path: req.path,
  });
});

/**
 * Global error handler
 */
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  logger.error({ error: err, path: req.path, method: req.method }, 'Unhandled error');

  // SEC-H5: Always return generic error messages to clients; details logged server-side
  res.status(500).json({
    success: false,
    error: 'Internal server error',
  });
});

/**
 * Graceful shutdown handler
 */
const gracefulShutdown = async (signal: string) => {
  logger.info({ signal }, 'Received shutdown signal, starting graceful shutdown');

  try {
    // 1. Parar metrics collector (background job)
    logger.info('Stopping metrics collector...');
    metricsCollectorService.stop();

    // 1.2. Parar docker logs collector
    logger.info('Stopping Docker logs collector...');
    try {
      await dockerLogsCollectorService.stop();
    } catch (error) {
      logger.warn({ error }, 'Error stopping Docker logs collector');
    }

    // 1.5. Parar usage cleanup timer
    logger.info('Stopping usage cleanup timer...');
    usageService.stopCleanupTimer();

    // 2. Parar health monitoring (primeiro para não gerar eventos durante shutdown)
    logger.info('Stopping health monitors...');
    healthMonitorService.stopAllMonitoring();

    // 3. Aguardar jobs ativos terminarem (max 30s)
    logger.info('Waiting for active workers to finish (max 30s)...');
    await Promise.race([
      stopAllWorkers(),
      new Promise(resolve => setTimeout(resolve, 30000))
    ]);

    // 4. Parar todos os daemons
    logger.info('Stopping all Claude daemons...');
    try {
      await claudeDaemonService.destroy();
    } catch (error) {
      logger.warn({ error }, 'Error stopping Claude daemons');
    }

    // 5. Destruir todas as queues
    logger.info('Destroying all queues...');
    try {
      await destroyAllQueues();
    } catch (error) {
      logger.warn({ error }, 'Error destroying queues');
    }

    // 5.5. Parar Telegram bot
    logger.info('Stopping Telegram bot...');
    try {
      await telegramService.stop();
    } catch (error) {
      logger.warn({ error }, 'Error stopping Telegram bot');
    }

    // 6. Fechar WebSocket
    const socketServer = getSocketServer();
    if (socketServer) {
      await new Promise<void>((resolve) => {
        socketServer.close(() => {
          logger.info('Socket.io server closed');
          resolve();
        });
      });
    }

    // 7. Fechar HTTP server
    await new Promise<void>((resolve) => {
      httpServer.close(() => {
        logger.info('HTTP server closed');
        resolve();
      });
    });

    // 8. Fechar database
    closeDatabase();

    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error({ error }, 'Error during graceful shutdown');
    setTimeout(() => {
      logger.info('Forcing shutdown after error');
      process.exit(1);
    }, 5000);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

/**
 * Start server
 */
const startServer = async () => {
  try {
    // SEC-C2: Validate auth configuration before starting
    validateAuthConfig();

    // Initialize database
    logger.info('Initializing database');
    initializeDatabase();

    // Run database migrations
    logger.info('Running database migrations');
    const migrationsApplied = runMigrations();
    if (migrationsApplied > 0) {
      logger.info({ count: migrationsApplied }, 'Database migrations applied');
    }

    // Log database stats
    const dbStats = getDatabaseStats();
    logger.info({ tables: dbStats.tables.length, size: dbStats.size }, 'Database ready');

    // Check Docker daemon connection
    logger.info('Checking Docker daemon connection');
    const dockerHealthy = await dockerService.ping();

    if (!dockerHealthy) {
      logger.error('Docker daemon is not accessible');
      throw new Error('Docker daemon is not accessible. Please ensure Docker is running.');
    }

    logger.info('Docker daemon connection successful');

    // Sync existing containers
    logger.info('Syncing existing containers');
    await containerService.syncContainers();

    // Auto-start Claude daemons for running containers
    logger.info('Auto-starting Claude daemons for running containers');
    try {
      const allContainers = await containerService.getAll(false); // false = não atualizar do Docker
      const runningContainers = allContainers.filter(c => c.status === 'running');

      logger.info({ count: runningContainers.length }, 'Found running containers');

      for (const container of runningContainers) {
        try {
          await containerLifecycleService.onContainerStart(container.id, container.dockerId);
          logger.info({ containerId: container.id }, 'Claude daemon auto-started');
        } catch (error) {
          logger.error({ error, containerId: container.id }, 'Failed to auto-start Claude daemon for running container');
        }
      }
    } catch (error) {
      logger.error({ error }, 'Failed to auto-start Claude daemons on startup');
    }

    // Initialize WebSocket server with namespaces
    logger.info('Initializing WebSocket server');
    io = initializeWebSocket(httpServer);

    // Start background metrics collector (for 5-hour chart history)
    logger.info('Starting background metrics collector');
    metricsCollectorService.start();

    // Start Docker logs collector (for 24-hour log history)
    logger.info('Starting Docker logs collector');
    dockerLogsCollectorService.start();

    // Start usage cleanup timer (deletes records older than 30 days)
    logger.info('Starting usage cleanup timer');
    usageService.startCleanupTimer();

    // Initialize Telegram Bot (if configured)
    if (process.env['TELEGRAM_BOT_TOKEN']) {
      try {
        logger.info('Initializing Telegram bot');
        await telegramService.start();
        logger.info('Telegram bot started successfully');
      } catch (error) {
        logger.error({ error }, 'Failed to start Telegram bot (non-fatal, continuing startup)');
      }
    } else {
      logger.info('TELEGRAM_BOT_TOKEN not set, skipping Telegram bot initialization');
    }

    // Start HTTP server
    httpServer.listen(PORT, HOST, () => {
      logger.info({
        port: PORT,
        host: HOST,
        nodeEnv: NODE_ENV,
        allowedOrigins: ALLOWED_ORIGINS,
      }, 'Server started successfully');

      logger.info(`API available at http://${HOST}:${PORT}`);
      logger.info(`WebSocket available at ws://${HOST}:${PORT}`);
      logger.info({ allowedOrigins: ALLOWED_ORIGINS }, 'CORS configured with allowed origins');
    });
  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }
};

/**
 * Handle unhandled rejections
 */
process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise }, 'Unhandled Promise rejection');
});

/**
 * Handle uncaught exceptions
 */
process.on('uncaughtException', (error) => {
  logger.error({ error }, 'Uncaught exception');
  process.exit(1);
});

// Start the server
startServer();

// Export for testing
export { app, io, httpServer };
