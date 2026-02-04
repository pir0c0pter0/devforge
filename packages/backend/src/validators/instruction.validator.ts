import { z } from 'zod'
import { logger } from '../utils/logger'

/**
 * Padrões perigosos que devem ser bloqueados
 * Inclui: fork bombs, rm -rf /, comandos destrutivos, etc.
 */
const DANGEROUS_PATTERNS = [
  // Fork bombs
  /:\(\)\s*\{\s*:\|:&\s*\}\s*;?\s*:/,  // :(){ :|:& };:
  /\.\s*\(\)\s*\{\s*\.\s*\|\s*\.&\s*\}/,  // .() { .|.& }

  // Comandos destrutivos
  /rm\s+(-[rf]+\s+)*\//i,  // rm -rf /
  /rm\s+(-[rf]+\s+)*\/\*/i,  // rm -rf /*
  /rm\s+(-[rf]+\s+)*~\//i,  // rm -rf ~/
  /mkfs\./i,  // mkfs.ext4 etc
  /dd\s+if=.*of=\/dev\//i,  // dd to disk

  // Privilege escalation
  /chmod\s+777\s+\//i,
  /chmod\s+-R\s+777/i,

  // Network attacks
  /nc\s+-[el]/i,  // netcat listener
  /ncat\s+-[el]/i,

  // Crypto miners (common patterns)
  /xmrig/i,
  /minerd/i,
  /cpuminer/i,
  /stratum\+tcp/i,

  // Reverse shells
  /bash\s+-i\s+>&\s*\/dev\/tcp/i,
  /\/dev\/tcp\/.*\/\d+/,
  /python.*socket.*connect/i,

  // Data exfiltration
  /curl.*\|\s*bash/i,
  /wget.*\|\s*bash/i,
  /curl.*\|\s*sh/i,
  /wget.*\|\s*sh/i,

  // Git credential theft
  /git\s+config.*credential/i,
  /\.git\/config/i,

  // Environment variable exfiltration
  /printenv|env\s*$/i,
  /cat.*\/proc\/.*environ/i,

  // Container escape attempts
  /--privileged/i,
  /docker\s+run.*--pid=host/i,
  /nsenter/i,
  /--cap-add/i,

  // SSH key theft
  /cat.*\.ssh\/id_/i,
  /scp.*\.ssh/i,

  // Kernel module manipulation
  /insmod|modprobe|rmmod/i,

  // Cron job injection
  /crontab/i,
  /\/etc\/cron/i,

  // Network scanning
  /nmap/i,
  /masscan/i,
]

/**
 * Padrões suspeitos que geram warning (não bloqueiam)
 */
const SUSPICIOUS_PATTERNS = [
  /sudo\s/i,
  /su\s+-/i,
  /passwd/i,
  /\.ssh\//i,
  /id_rsa/i,
  /\.env/i,
  /credentials/i,
  /secret/i,
  /api[_-]?key/i,
]

export interface ValidationResult {
  valid: boolean
  blocked: boolean
  warnings: string[]
  reason?: string
}

/**
 * Valida uma instrução contra padrões perigosos
 */
export function validateInstructionContent(instruction: string): ValidationResult {
  const warnings: string[] = []

  // Verificar tamanho máximo (10KB)
  if (instruction.length > 10240) {
    return {
      valid: false,
      blocked: true,
      warnings: [],
      reason: 'Instruction too long (max 10KB)'
    }
  }

  // Verificar padrões perigosos
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(instruction)) {
      logger.warn({
        pattern: pattern.toString(),
        instructionPreview: instruction.substring(0, 100)
      }, 'Dangerous instruction pattern detected and blocked')

      return {
        valid: false,
        blocked: true,
        warnings: [],
        reason: 'Instruction contains dangerous patterns'
      }
    }
  }

  // Verificar padrões suspeitos (warning only)
  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(instruction)) {
      warnings.push(`Suspicious pattern detected: ${pattern.toString()}`)
    }
  }

  if (warnings.length > 0) {
    logger.info({
      warnings,
      instructionPreview: instruction.substring(0, 100)
    }, 'Instruction contains suspicious patterns (allowed)')
  }

  return {
    valid: true,
    blocked: false,
    warnings
  }
}

/**
 * Schema Zod para instrução segura
 */
export const safeInstructionSchema = z.string()
  .min(1, 'Instruction cannot be empty')
  .max(10240, 'Instruction too long (max 10KB)')
  .refine(
    (instruction) => {
      const result = validateInstructionContent(instruction)
      return result.valid
    },
    {
      message: 'Instruction contains dangerous patterns'
    }
  )

/**
 * Sanitiza instrução removendo caracteres perigosos
 */
export function sanitizeInstruction(instruction: string): string {
  return instruction
    // Remove null bytes
    .replace(/\x00/g, '')
    // Remove caracteres de controle (exceto newline, tab, carriage return)
    .replace(/[\x01-\x08\x0b\x0c\x0e-\x1f]/g, '')
    // Limita tamanho
    .substring(0, 10240)
}

/**
 * Valida e sanitiza instrução
 * Retorna instrução sanitizada ou lança erro se perigosa
 */
export function validateAndSanitize(instruction: string): string {
  const sanitized = sanitizeInstruction(instruction)
  const validation = validateInstructionContent(sanitized)

  if (!validation.valid) {
    throw new Error(validation.reason || 'Invalid instruction')
  }

  return sanitized
}
