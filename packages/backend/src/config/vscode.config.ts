export const VSCodeConfig = {
  /** Timeout para aguardar VS Code ficar pronto (ms) */
  STARTUP_TIMEOUT_MS: 60_000,

  /** Timeout reduzido para restart de container existente (ms) */
  RESTART_TIMEOUT_MS: 30_000,

  /** Delay de estabilização após primeiro health check positivo (ms) */
  STABILIZATION_DELAY_MS: 3_000,

  /** Intervalo entre health checks (ms) */
  POLL_INTERVAL_MS: 1_000,

  /** HTTP status codes considerados saudáveis */
  HEALTHY_STATUS_CODES: ['200', '302'] as const,

  /** Endpoint de health check do code-server */
  HEALTH_ENDPOINT: 'http://localhost:8080/healthz',

  /** Porta interna do code-server */
  INTERNAL_PORT: 8080,
} as const;

export const TaskProgressRanges = {
  /** Container Docker iniciando (0-35%) */
  DOCKER_START: { START: 0, END: 35 },

  /** VS Code inicializando (35-60%) */
  VSCODE_STARTUP: { START: 35, END: 60 },

  /** Claude environment (60-80%) */
  CLAUDE_STARTUP: { START: 60, END: 80 },

  /** Finalizando (80-100%) */
  FINALIZING: { START: 80, END: 100 },
} as const;
