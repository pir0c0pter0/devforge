/**
 * Container-specific message formatters for Telegram Bot
 *
 * These formatters produce MarkdownV2 formatted strings for container-related
 * information display in Telegram messages.
 */

import { markdown } from './markdown.formatter'
import type {
  Container,
  ContainerMetrics,
  QueueStatus,
} from '@devforge/shared'
import type { UsageSummary } from '../../services/usage.service'

/**
 * Stats data combining metrics and usage
 */
export interface ContainerStats {
  metrics: ContainerMetrics
  usage?: UsageSummary
}

/**
 * Instruction execution result
 */
export interface InstructionResult {
  jobId: string
  instruction: string
  status: 'completed' | 'failed'
  stdout?: string
  stderr?: string
  exitCode?: number
  duration?: number
  cost?: number
  error?: string
}

/**
 * Container formatters for Telegram messages
 */
export const containerFormatter = {
  /**
   * Format container list for /list command
   *
   * @param containers - Array of containers
   * @returns MarkdownV2 formatted container list
   */
  formatList(containers: Container[]): string {
    if (!containers || containers.length === 0) {
      return `\u{1F4E6} *Seus Containers*\n\n${markdown.italic('Nenhum container encontrado.')}\n\n${markdown.escape('Use /create para criar um novo container.')}`
    }

    const lines: string[] = ['\u{1F4E6} *Seus Containers*\n']

    for (const container of containers) {
      const statusLine = markdown.status(container.status as 'running' | 'stopped' | 'creating' | 'error')
      const name = markdown.code(container.name)
      const mode = container.mode === 'autonomous' ? '\u{1F916}' : '\u{1F464}'

      lines.push(`${statusLine} ${name} ${mode}`)

      // Add template info
      const template = container.template === 'claude' ? 'Claude Code' : container.template
      lines.push(`   ${markdown.escape(`Template: ${template}`)}`)

      lines.push('')
    }

    lines.push(markdown.italic('Use /select <nome> para selecionar um container'))

    return lines.join('\n')
  },

  /**
   * Format container details for /select command
   *
   * @param container - Container details
   * @returns MarkdownV2 formatted container details
   */
  formatDetails(container: Container): string {
    const lines: string[] = []

    // Header with name and status
    lines.push(`\u{1F4E6} *Container:* ${markdown.code(container.name)}`)
    lines.push('')
    lines.push(markdown.status(container.status as 'running' | 'stopped' | 'creating' | 'error'))
    lines.push('')

    // Details section
    lines.push('*Detalhes*')
    lines.push(`\u{251C} ID: ${markdown.code(container.id.slice(0, 12))}`)
    lines.push(`\u{251C} Template: ${markdown.escape(container.template)}`)
    lines.push(`\u{251C} Modo: ${container.mode === 'autonomous' ? '\u{1F916} Autônomo' : '\u{1F464} Interativo'}`)

    // Format creation date
    const createdAt = new Date(container.createdAt)
    const dateStr = createdAt.toLocaleDateString('pt-BR')
    lines.push(`\u{2514} Criado: ${markdown.escape(dateStr)}`)

    lines.push('')

    // Actions hint
    if (container.status === 'running') {
      lines.push(markdown.italic('Comandos: /exec, /stats, /queue, /stop'))
    } else {
      lines.push(markdown.italic('Comandos: /start, /delete'))
    }

    return lines.join('\n')
  },

  /**
   * Format container stats for /stats command
   *
   * @param stats - Container stats with metrics and usage
   * @returns MarkdownV2 formatted stats
   */
  formatStats(stats: ContainerStats): string {
    const { metrics, usage } = stats
    const lines: string[] = []

    lines.push(`\u{1F4CA} *Estatísticas*`)
    lines.push('')

    // Resource usage section
    lines.push('*Recursos*')

    // CPU
    const cpuPercent = Math.round(metrics.cpu.usage)
    const cpuBar = markdown.progressBar(cpuPercent)
    lines.push(`\u{251C} CPU: ${cpuBar} ${cpuPercent}%`)

    // Memory
    const memPercent = Math.round(metrics.memory.percentage)
    const memBar = markdown.progressBar(memPercent)
    const memUsed = markdown.formatBytes(metrics.memory.usage * 1024 * 1024)
    const memLimit = markdown.formatBytes(metrics.memory.limit * 1024 * 1024)
    lines.push(`\u{251C} Mem: ${memBar} ${memUsed}/${memLimit}`)

    // Disk
    const diskPercent = Math.round(metrics.disk.percentage)
    const diskBar = markdown.progressBar(diskPercent)
    const diskUsed = markdown.formatBytes(metrics.disk.usage * 1024 * 1024)
    const diskLimit = markdown.formatBytes(metrics.disk.limit * 1024 * 1024)
    lines.push(`\u{2514} Disco: ${diskBar} ${diskUsed}/${diskLimit}`)

    // Network (if available)
    if (metrics.network) {
      lines.push('')
      lines.push('*Rede*')
      lines.push(`\u{251C} \u{2B07} RX: ${markdown.formatBytes(metrics.network.rxBytes)}`)
      lines.push(`\u{2514} \u{2B06} TX: ${markdown.formatBytes(metrics.network.txBytes)}`)
    }

    // Usage section (if available)
    if (usage) {
      lines.push('')
      lines.push('*Uso Claude*')

      // Session usage
      const sessionTokens = markdown.formatNumber(usage.session.tokens)
      const sessionCost = markdown.formatCost(usage.session.cost)
      lines.push(`\u{251C} Sessão: ${markdown.escape(sessionTokens)} tokens \\(${markdown.escape(sessionCost)}\\)`)

      // Daily usage
      const dailyTokens = markdown.formatNumber(usage.daily.tokens)
      const dailyCost = markdown.formatCost(usage.daily.cost)
      lines.push(`\u{251C} Hoje: ${markdown.escape(dailyTokens)} tokens \\(${markdown.escape(dailyCost)}\\)`)

      // Weekly usage
      const weeklyTokens = markdown.formatNumber(usage.weekly.tokens)
      const weeklyCost = markdown.formatCost(usage.weekly.cost)
      lines.push(`\u{2514} Semana: ${markdown.escape(weeklyTokens)} tokens \\(${markdown.escape(weeklyCost)}\\)`)
    }

    // Active agents
    if (metrics.activeAgents && metrics.activeAgents.length > 0) {
      lines.push('')
      lines.push(`*Agentes Ativos:* ${metrics.activeAgents.length}`)
    }

    return lines.join('\n')
  },

  /**
   * Format queue status for /queue command
   *
   * @param queue - Queue status
   * @returns MarkdownV2 formatted queue status
   */
  formatQueue(queue: QueueStatus): string {
    const lines: string[] = []

    lines.push(`\u{1F4CB} *Fila de Instruções*`)
    lines.push('')

    // Queue counts
    const total = queue.waiting + queue.active + queue.completed + queue.failed

    if (total === 0) {
      lines.push(markdown.italic('Fila vazia'))
      lines.push('')
      lines.push(markdown.escape('Use /exec <instrução> para adicionar'))
      return lines.join('\n')
    }

    lines.push('*Status*')
    lines.push(`\u{251C} \u{23F3} Aguardando: ${queue.waiting}`)
    lines.push(`\u{251C} \u{25B6}\u{FE0F} Executando: ${queue.active}`)
    lines.push(`\u{251C} \u{2705} Concluídos: ${queue.completed}`)
    lines.push(`\u{2514} \u{274C} Falhos: ${queue.failed}`)

    // Show pending jobs
    if (queue.jobs && queue.jobs.length > 0) {
      lines.push('')
      lines.push('*Jobs Pendentes*')

      const pendingJobs = queue.jobs
        .filter((j) => j.status === 'pending' || j.status === 'running')
        .slice(0, 5)

      for (let i = 0; i < pendingJobs.length; i++) {
        const job = pendingJobs[i]
        if (job) {
          const prefix = i === pendingJobs.length - 1 ? '\u{2514}' : '\u{251C}'
          const statusIcon = job.status === 'running' ? '\u{25B6}\u{FE0F}' : '\u{23F3}'
          const truncatedInstr = markdown.truncate(job.instruction, 30)
          lines.push(`${prefix} ${statusIcon} ${markdown.code(truncatedInstr)}`)
        }
      }

      if (queue.jobs.length > 5) {
        lines.push('')
        lines.push(markdown.italic(`+ ${queue.jobs.length - 5} mais...`))
      }
    }

    return lines.join('\n')
  },

  /**
   * Format instruction result for /exec response
   *
   * @param result - Instruction execution result
   * @returns MarkdownV2 formatted result
   */
  formatInstructionResult(result: InstructionResult): string {
    const lines: string[] = []

    // Status header
    if (result.status === 'completed') {
      lines.push(`\u{2705} *Instrução Concluída*`)
    } else {
      lines.push(`\u{274C} *Instrução Falhou*`)
    }
    lines.push('')

    // Job ID
    lines.push(`*Job:* ${markdown.code(result.jobId)}`)
    lines.push('')

    // Instruction (truncated)
    const truncatedInstr = markdown.truncate(result.instruction, 80)
    lines.push(`*Instrução:*`)
    lines.push(markdown.code(truncatedInstr))
    lines.push('')

    // Duration and cost (if available)
    if (result.duration !== undefined || result.cost !== undefined) {
      lines.push('*Métricas*')
      if (result.duration !== undefined) {
        lines.push(`\u{251C} \u{23F1} Duração: ${markdown.escape(markdown.formatDuration(result.duration))}`)
      }
      if (result.cost !== undefined) {
        const costStr = markdown.formatCost(result.cost)
        lines.push(`\u{2514} \u{1F4B0} Custo: ${markdown.escape(costStr)}`)
      }
      lines.push('')
    }

    // Output or error
    if (result.status === 'completed' && result.stdout) {
      lines.push('*Resposta:*')
      // Truncate long outputs to fit Telegram message limits
      const output = markdown.truncate(result.stdout, 2000)
      lines.push(markdown.codeBlock(output))
    } else if (result.error) {
      lines.push('*Erro:*')
      lines.push(markdown.codeBlock(result.error))
    }

    // Exit code for failures
    if (result.status === 'failed' && result.exitCode !== undefined) {
      lines.push('')
      lines.push(`*Exit Code:* ${result.exitCode}`)
    }

    return lines.join('\n')
  },

  /**
   * Format a simple success message
   *
   * @param message - Success message
   * @returns MarkdownV2 formatted success message
   */
  formatSuccess(message: string): string {
    return `\u{2705} ${markdown.escape(message)}`
  },

  /**
   * Format a simple error message
   *
   * @param message - Error message
   * @returns MarkdownV2 formatted error message
   */
  formatError(message: string): string {
    return `\u{274C} ${markdown.escape(message)}`
  },

  /**
   * Format a warning message
   *
   * @param message - Warning message
   * @returns MarkdownV2 formatted warning message
   */
  formatWarning(message: string): string {
    return `\u{26A0}\u{FE0F} ${markdown.escape(message)}`
  },

  /**
   * Format container started message
   *
   * @param containerName - Name of the started container
   * @returns MarkdownV2 formatted message
   */
  formatStarted(containerName: string): string {
    return `\u{1F7E2} Container ${markdown.code(containerName)} iniciado com sucesso\\!`
  },

  /**
   * Format container stopped message
   *
   * @param containerName - Name of the stopped container
   * @returns MarkdownV2 formatted message
   */
  formatStopped(containerName: string): string {
    return `\u{1F534} Container ${markdown.code(containerName)} parado\\.`
  },

  /**
   * Format instruction queued message
   *
   * @param jobId - Job ID
   * @param position - Position in queue
   * @returns MarkdownV2 formatted message
   */
  formatQueued(jobId: string, position: number): string {
    return `\u{23F3} Instrução adicionada à fila\n\n*Job:* ${markdown.code(jobId)}\n*Posição:* ${position}`
  },
}
