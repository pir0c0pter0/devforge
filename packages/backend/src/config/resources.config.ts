/**
 * QA-M2: Centralized resource limit constants
 * Replaces magic numbers (10240, 4096, 20480) across the codebase
 */

/** Default container resource limits */
export const ResourceDefaults = {
  /** Default CPU limit in cores */
  CPU_CORES: 2,
  /** Default memory limit in MB */
  MEMORY_MB: 4096,
  /** Default disk limit in MB (10 GB) */
  DISK_MB: 10240,
  /** Default disk limit for templates in MB (20 GB) */
  TEMPLATE_DISK_MB: 20480,
} as const

/** Maximum resource limits */
export const ResourceLimits = {
  /** Maximum disk limit in MB (100 GB) */
  MAX_DISK_MB: 102400,
  /** Maximum memory limit in MB (64 GB) */
  MAX_MEMORY_MB: 65536,
  /** Maximum CPU cores */
  MAX_CPU_CORES: 16,
} as const

/** Process limits for containers (ulimits) */
export const ProcessLimits = {
  /** Max number of processes (soft) */
  NPROC_SOFT: 4096,
  /** Max number of processes (hard) */
  NPROC_HARD: 8192,
} as const

/** Instruction limits */
export const InstructionLimits = {
  /** Maximum instruction size in bytes (10 KB) */
  MAX_SIZE_BYTES: 10240,
  /** Maximum message length for Telegram */
  MAX_TELEGRAM_MESSAGE: 4096,
} as const
