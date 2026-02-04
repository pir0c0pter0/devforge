import { BaseCommand, CommandCategory } from './base.command'
import type { BotContext } from '../telegram.types'
import { markdown } from '../formatters/markdown.formatter'
import { containerRepository } from '../../repositories/container.repository'
import { queueInstruction } from '../../services/claude-queue.service'
import { createChildLogger } from '../../utils/logger'

const logger = createChildLogger({ service: 'telegram', command: 'exec' })

/**
 * Tamanho maximo da instrucao em caracteres
 */
const MAX_INSTRUCTION_LENGTH = 4000

/**
 * /exec <instrucao> - Envia instrucao ao Claude Code
 *
 * Exemplos:
 * - /exec liste os arquivos do projeto
 * - /exec crie um componente Button
 * - /exec explique o codigo do arquivo main.ts
 */
export class ExecCommand extends BaseCommand {
  readonly name = 'exec'
  readonly description = 'Enviar instrucao ao Claude Code'
  readonly usage = '/exec <instrucao>'
  readonly category: CommandCategory = 'instructions'
  override readonly examples = [
    '/exec liste os arquivos do projeto',
    '/exec crie um componente Button',
    '/exec explique o arquivo main.ts',
  ] as const

  override async execute(ctx: BotContext, args: string[]): Promise<void> {
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
          markdown.escape('Container precisa estar rodando para receber instrucoes.') +
          '\n' +
          markdown.escape('Use /start para iniciar o container.')
      )
      return
    }

    // Extrair instrucao dos argumentos
    const instruction = args.join(' ').trim()

    // Validar instrucao nao vazia
    if (!instruction) {
      await this.reply(
        ctx,
        markdown.escape('Instrucao vazia.') +
          '\n\n' +
          markdown.escape('Uso: /exec <sua instrucao>') +
          '\n\n' +
          markdown.escape('Exemplos:') +
          '\n' +
          markdown.escape('  /exec liste os arquivos do projeto') +
          '\n' +
          markdown.escape('  /exec crie um componente Button') +
          '\n' +
          markdown.escape('  /exec explique o arquivo main.ts')
      )
      return
    }

    // Validar tamanho maximo
    if (instruction.length > MAX_INSTRUCTION_LENGTH) {
      await this.reply(
        ctx,
        markdown.escape(`Instrucao muito longa (${instruction.length} caracteres).`) +
          '\n\n' +
          markdown.escape(`Limite maximo: ${MAX_INSTRUCTION_LENGTH} caracteres.`) +
          '\n\n' +
          markdown.escape('Divida em instrucoes menores se necessario.')
      )
      return
    }

    try {
      // Adicionar instrucao na fila
      const jobInfo = await queueInstruction(
        containerId,
        instruction,
        container.mode // Usar modo do container (interactive ou autonomous)
      )

      // Formatar confirmacao
      const truncatedInstruction = this.truncateInstruction(instruction, 50)

      const response = this.formatConfirmation(
        container.name,
        truncatedInstruction,
        jobInfo.id,
        jobInfo.position
      )

      await this.reply(ctx, response)

      logger.info(
        {
          containerId,
          containerName: container.name,
          jobId: jobInfo.id,
          instructionLength: instruction.length,
          queuePosition: jobInfo.position,
        },
        'Instruction queued via Telegram'
      )
    } catch (error) {
      logger.error({ error, containerId }, 'Failed to queue instruction')

      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido'

      await this.reply(
        ctx,
        markdown.escape('Erro ao enviar instrucao:') +
          '\n' +
          markdown.escape(errorMessage)
      )
    }
  }

  /**
   * Formata a mensagem de confirmacao
   */
  private formatConfirmation(
    containerName: string,
    instruction: string,
    jobId: string,
    queuePosition: number
  ): string {
    const lines: string[] = []

    // Header
    lines.push(`✅ *Instrucao enviada\\!*`)
    lines.push('')

    // Container
    lines.push(`📦 *Container:* ${markdown.escape(containerName)}`)

    // Instrucao
    lines.push(`💬 *Instrucao:* ${markdown.code(instruction)}`)

    // Job ID (truncado para exibicao)
    const shortJobId = jobId.length > 8 ? jobId.substring(0, 8) : jobId
    lines.push(`🆔 *Job:* ${markdown.code(shortJobId)}`)

    // Posicao na fila
    if (queuePosition === 0) {
      lines.push(`⚡ *Status:* Executando agora`)
    } else if (queuePosition === 1) {
      lines.push(`⏳ *Status:* Proximo na fila`)
    } else {
      lines.push(`⏳ *Status:* Posicao ${markdown.escape(String(queuePosition))} na fila`)
    }

    lines.push('')
    lines.push(markdown.escape('Use /queue para acompanhar o progresso.'))

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
export const execCommand = new ExecCommand()
