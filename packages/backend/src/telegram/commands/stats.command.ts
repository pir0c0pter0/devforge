import { BaseCommand, CommandCategory } from './base.command'
import type { BotContext } from '../telegram.types'
import { markdown } from '../formatters/markdown.formatter'
import { containerRepository } from '../../repositories/container.repository'
import { metricsService } from '../../services/metrics.service'
import { createChildLogger } from '../../utils/logger'
import { ResourceDefaults } from '../../config/resources.config'

const logger = createChildLogger({ service: 'telegram', command: 'stats' })

/**
 * /stats - Exibe estatisticas do container selecionado
 *
 * Mostra metricas em tempo real:
 * - CPU: uso% / limite
 * - Memoria: uso MB / limite MB (%)
 * - Disco: uso GB / limite GB (%)
 * - Uptime do container
 */
export class StatsCommand extends BaseCommand {
  readonly name = 'stats'
  readonly description = 'Estatisticas do container selecionado'
  readonly usage = '/stats'
  readonly category: CommandCategory = 'containers'
  override readonly examples = ['/stats'] as const

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

    // Verificar se container esta rodando
    if (container.status !== 'running') {
      const statusEmoji = container.status === 'stopped' ? '🔴' : '🟡'
      await this.reply(
        ctx,
        `${statusEmoji} *${markdown.escape(container.name)}*\n\n` +
          markdown.escape(`Status: ${container.status}`) +
          '\n\n' +
          markdown.escape('Container precisa estar rodando para mostrar metricas.') +
          '\n' +
          markdown.escape('Use /start para iniciar o container.')
      )
      return
    }

    // Mostrar mensagem de carregamento
    const loadingMsg = await ctx.reply(
      markdown.escape('Coletando metricas...'),
      { parse_mode: 'MarkdownV2' }
    )

    try {
      // Buscar metricas em tempo real
      const metrics = await metricsService.getContainerMetrics(container.dockerId)

      // Calcular uptime
      const uptime = this.calculateUptime(container.startedAt)

      // Calcular percentuais de disco com limites do container
      const diskUsageMB = metrics.disk.usage
      const diskLimitMB = container.diskLimit || ResourceDefaults.DISK_MB
      const diskPercent = diskLimitMB > 0 ? (diskUsageMB / diskLimitMB) * 100 : 0

      // Formatar resposta
      const response = this.formatStats(
        container.name,
        {
          cpuUsage: metrics.cpu.usage,
          cpuLimit: metrics.cpu.limit,
          memoryUsageMB: metrics.memory.usage,
          memoryLimitMB: metrics.memory.limit,
          memoryPercent: metrics.memory.percentage,
          diskUsageMB,
          diskLimitMB,
          diskPercent,
          uptime,
          activeAgents: metrics.activeAgents.length,
        }
      )

      // Editar mensagem com as metricas
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        loadingMsg.message_id,
        undefined,
        response,
        { parse_mode: 'MarkdownV2' }
      )

      logger.info(
        { containerId, containerName: container.name },
        'Stats displayed successfully'
      )
    } catch (error) {
      logger.error({ error, containerId }, 'Failed to get container stats')

      // Editar mensagem com erro
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        loadingMsg.message_id,
        undefined,
        markdown.escape('Erro ao coletar metricas. Tente novamente.'),
        { parse_mode: 'MarkdownV2' }
      )
    }
  }

  /**
   * Calcula uptime a partir da data de inicio
   */
  private calculateUptime(startedAt: Date | undefined): string {
    if (!startedAt) return 'N/A'

    const now = new Date()
    const diffMs = now.getTime() - startedAt.getTime()

    const seconds = Math.floor(diffMs / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`
    }
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`
    }
    return `${seconds}s`
  }

  /**
   * Formata a resposta com as metricas
   */
  private formatStats(
    containerName: string,
    stats: {
      cpuUsage: number
      cpuLimit: number
      memoryUsageMB: number
      memoryLimitMB: number
      memoryPercent: number
      diskUsageMB: number
      diskLimitMB: number
      diskPercent: number
      uptime: string
      activeAgents: number
    }
  ): string {
    const lines: string[] = []

    // Header
    lines.push(`📊 *${markdown.escape(containerName)}*`)
    lines.push('')

    // CPU
    const cpuBar = markdown.progressBar(stats.cpuUsage, 10)
    const cpuEmoji = stats.cpuUsage >= 90 ? '🔴' : stats.cpuUsage >= 70 ? '🟡' : '🟢'
    lines.push(
      `${cpuEmoji} *CPU:* ${cpuBar} ${markdown.escape(`${stats.cpuUsage.toFixed(1)}%`)} \\/ ${markdown.escape(`${stats.cpuLimit} cores`)}`
    )

    // Memoria
    const memBar = markdown.progressBar(stats.memoryPercent, 10)
    const memEmoji = stats.memoryPercent >= 90 ? '🔴' : stats.memoryPercent >= 70 ? '🟡' : '🟢'
    const memUsageStr = stats.memoryUsageMB >= 1024
      ? `${(stats.memoryUsageMB / 1024).toFixed(1)}GB`
      : `${stats.memoryUsageMB.toFixed(0)}MB`
    const memLimitStr = stats.memoryLimitMB >= 1024
      ? `${(stats.memoryLimitMB / 1024).toFixed(1)}GB`
      : `${stats.memoryLimitMB.toFixed(0)}MB`
    lines.push(
      `${memEmoji} *Memoria:* ${memBar} ${markdown.escape(memUsageStr)} \\/ ${markdown.escape(memLimitStr)} \\(${markdown.escape(`${stats.memoryPercent.toFixed(1)}%`)}\\)`
    )

    // Disco
    const diskBar = markdown.progressBar(stats.diskPercent, 10)
    const diskEmoji = stats.diskPercent >= 90 ? '🔴' : stats.diskPercent >= 70 ? '🟡' : '🟢'
    const diskUsageStr = stats.diskUsageMB >= 1024
      ? `${(stats.diskUsageMB / 1024).toFixed(2)}GB`
      : `${stats.diskUsageMB.toFixed(0)}MB`
    const diskLimitStr = stats.diskLimitMB >= 1024
      ? `${(stats.diskLimitMB / 1024).toFixed(1)}GB`
      : `${stats.diskLimitMB.toFixed(0)}MB`
    lines.push(
      `${diskEmoji} *Disco:* ${diskBar} ${markdown.escape(diskUsageStr)} \\/ ${markdown.escape(diskLimitStr)} \\(${markdown.escape(`${stats.diskPercent.toFixed(1)}%`)}\\)`
    )

    lines.push('')

    // Uptime
    lines.push(`⏱ *Uptime:* ${markdown.escape(stats.uptime)}`)

    // Agentes ativos
    if (stats.activeAgents > 0) {
      lines.push(`🤖 *Agentes Claude:* ${markdown.escape(String(stats.activeAgents))} ativo\\(s\\)`)
    }

    return lines.join('\n')
  }
}

// Export singleton instance
export const statsCommand = new StatsCommand()
