import { BaseCommand, CommandCategory } from './base.command'
import type { BotContext } from '../telegram.types'
import { markdown } from '../formatters/markdown.formatter'
import { containerRepository } from '../../repositories/container.repository'
import {
  getQueueStatus,
  getJobHistory,
  getJob,
  type QueueStatus,
  type JobHistoryItem,
} from '../../services/claude-queue.service'
import { createChildLogger } from '../../utils/logger'

const logger = createChildLogger({ service: 'telegram', command: 'queue' })

/**
 * /queue - Status da fila de instrucoes do container selecionado
 *
 * Mostra:
 * - Jobs pendentes: X
 * - Job ativo: "instrucao..." (progress%)
 * - Ultimos 3 completados com status
 */
export class QueueCommand extends BaseCommand {
  readonly name = 'queue'
  readonly description = 'Status da fila de instrucoes'
  readonly usage = '/queue'
  readonly category: CommandCategory = 'instructions'
  override readonly examples = ['/queue'] as const

  override async execute(ctx: BotContext, _args: string[]): Promise<void> {
    this.updateActivity(ctx)

    const containerId = this.getSelectedContainer(ctx)

    if (!containerId) {
      await this.reply(
        ctx,
        markdown.escape('Nenhum container selecionado.') +
          '\n\n' +
          markdown.escape('Use /select para escolher um container primeiro.')
      )
      return
    }

    // Buscar container no repositorio
    const container = containerRepository.findById(containerId)

    if (!container) {
      this.clearSelectedContainer(ctx)
      await this.reply(
        ctx,
        markdown.escape('Container nao encontrado. Pode ter sido excluido.') +
          '\n\n' +
          markdown.escape('Use /select para escolher outro container.')
      )
      return
    }

    try {
      // Buscar status da fila
      const queueStatus = await getQueueStatus(containerId)

      // Buscar historico de jobs
      const history = await getJobHistory(containerId, 10)

      // Separar jobs por status
      const activeJobs = history.filter((j) => j.status === 'active')
      const waitingJobs = history.filter((j) => j.status === 'waiting' || j.status === 'delayed')
      const completedJobs = history.filter((j) => j.status === 'completed').slice(0, 3)
      const failedJobs = history.filter((j) => j.status === 'failed').slice(0, 2)

      // Formatar resposta
      const response = await this.formatQueueStatus(
        container.name,
        queueStatus,
        activeJobs,
        waitingJobs,
        completedJobs,
        failedJobs,
        containerId
      )

      await this.reply(ctx, response)

      logger.info(
        { containerId, containerName: container.name, queueStatus },
        'Queue status displayed successfully'
      )
    } catch (error) {
      logger.error({ error, containerId }, 'Failed to get queue status')

      await this.reply(
        ctx,
        markdown.escape('Erro ao obter status da fila. Tente novamente.')
      )
    }
  }

  /**
   * Formata o status da fila para exibicao
   */
  private async formatQueueStatus(
    containerName: string,
    status: QueueStatus,
    activeJobs: JobHistoryItem[],
    waitingJobs: JobHistoryItem[],
    completedJobs: JobHistoryItem[],
    failedJobs: JobHistoryItem[],
    containerId: string
  ): Promise<string> {
    const lines: string[] = []

    // Header
    lines.push(`📋 *Fila: ${markdown.escape(containerName)}*`)
    lines.push('')

    // Status geral
    const statusEmoji = status.isPaused ? '⏸' : status.active > 0 ? '▶️' : '⏹'
    const statusText = status.isPaused ? 'Pausada' : status.active > 0 ? 'Processando' : 'Ociosa'
    lines.push(`${statusEmoji} *Status:* ${markdown.escape(statusText)}`)

    // Contadores
    lines.push('')
    lines.push(`📊 *Resumo:*`)
    lines.push(`  • Pendentes: ${markdown.escape(String(status.waiting))}`)
    lines.push(`  • Ativos: ${markdown.escape(String(status.active))}`)
    lines.push(`  • Completados: ${markdown.escape(String(status.completed))}`)
    lines.push(`  • Falhas: ${markdown.escape(String(status.failed))}`)

    // Job ativo (com progress se disponivel)
    if (activeJobs.length > 0) {
      lines.push('')
      lines.push(`🔄 *Executando:*`)

      for (const job of activeJobs) {
        // Tentar obter detalhes do job para progress
        const jobDetails = await getJob(containerId, job.id)
        const instruction = this.truncateInstruction(job.instruction, 40)

        if (jobDetails?.progress) {
          const progressBar = markdown.progressBar(jobDetails.progress.percentage, 8)
          lines.push(
            `  ${progressBar} ${markdown.escape(`${jobDetails.progress.percentage.toFixed(0)}%`)}`
          )
          lines.push(`  ${markdown.code(instruction)}`)
          if (jobDetails.progress.message) {
            lines.push(`  _${markdown.escape(this.truncateInstruction(jobDetails.progress.message, 30))}_`)
          }
        } else {
          lines.push(`  ${markdown.code(instruction)}`)
        }
      }
    }

    // Jobs aguardando
    if (waitingJobs.length > 0) {
      lines.push('')
      lines.push(`⏳ *Aguardando \\(${markdown.escape(String(waitingJobs.length))}\\):*`)

      const showJobs = waitingJobs.slice(0, 3)
      for (let i = 0; i < showJobs.length; i++) {
        const job = showJobs[i]
        if (!job) continue
        const instruction = this.truncateInstruction(job.instruction, 35)
        lines.push(`  ${markdown.escape(`${i + 1}.`)} ${markdown.code(instruction)}`)
      }

      if (waitingJobs.length > 3) {
        lines.push(`  _\\.\\.\\. e mais ${markdown.escape(String(waitingJobs.length - 3))}_`)
      }
    }

    // Ultimos completados
    if (completedJobs.length > 0) {
      lines.push('')
      lines.push(`✅ *Recentes:*`)

      for (const job of completedJobs) {
        const instruction = this.truncateInstruction(job.instruction, 30)
        const duration = job.duration ? markdown.formatDuration(job.duration) : 'N/A'
        lines.push(
          `  • ${markdown.code(instruction)} \\(${markdown.escape(duration)}\\)`
        )
      }
    }

    // Ultimas falhas
    if (failedJobs.length > 0) {
      lines.push('')
      lines.push(`❌ *Falhas recentes:*`)

      for (const job of failedJobs) {
        const instruction = this.truncateInstruction(job.instruction, 25)
        const errorMsg = job.error
          ? this.truncateInstruction(job.error, 30)
          : 'Erro desconhecido'
        lines.push(`  • ${markdown.code(instruction)}`)
        lines.push(`    _${markdown.escape(errorMsg)}_`)
      }
    }

    // Dica se fila vazia
    if (status.waiting === 0 && status.active === 0 && completedJobs.length === 0) {
      lines.push('')
      lines.push(markdown.escape('Fila vazia. Use /exec para enviar uma instrucao.'))
    }

    return lines.join('\n')
  }

  /**
   * Trunca instrucao para exibicao
   */
  private truncateInstruction(text: string, maxLength: number): string {
    // Remove quebras de linha
    const clean = text.replace(/\n/g, ' ').trim()

    if (clean.length <= maxLength) {
      return clean
    }

    return clean.substring(0, maxLength - 3) + '...'
  }
}

// Export singleton instance
export const queueCommand = new QueueCommand()
