import { Queue, QueueEvents, JobsOptions, Job } from 'bullmq'
import { logger } from '../utils/logger'
import { validateContainerId, validateInstruction } from '../validators/claude.validators'
import { getOrCreateWorker, stopWorker } from '../workers/claude.worker'
import { getRedisConnection } from '../utils/redis'
import {
  emitInstructionPending,
  emitInstructionFailed,
  emitQueueStatsUpdate,
} from './websocket.service'
import type { InstructionJobData, InstructionEventData } from '@devforge/shared'

/**
 * Maximum number of pending jobs per container to prevent DoS
 */
const MAX_QUEUE_SIZE = 100

/**
 * Estrutura simplificada de informações do job
 */
export interface JobInfo {
  id: string
  position: number
  status: string
}

/**
 * Detalhes completos de um job
 */
export interface JobDetails {
  id: string
  instruction: string
  mode: 'interactive' | 'autonomous'
  status: string
  progress?: {
    percentage: number
    message: string
    timestamp: Date
  }
  result?: {
    stdout: string
    stderr: string
    exitCode: number
    duration: number
    completedAt: Date
  }
  error?: string
  attemptsMade: number
  maxAttempts: number
  createdAt: Date
  processedAt?: Date
  finishedAt?: Date
}

/**
 * Histórico de jobs
 */
export interface JobHistoryItem {
  id: string
  instruction: string
  mode: 'interactive' | 'autonomous'
  status: string
  createdAt: Date
  finishedAt?: Date
  duration?: number
  error?: string
}

/**
 * Status detalhado da fila
 */
export interface QueueStatus {
  waiting: number
  active: number
  completed: number
  failed: number
  delayed: number
  isPaused: boolean
}

/**
 * Job pendente na fila
 */
export interface PendingJob {
  id: string | undefined
  instruction: string
  mode: 'interactive' | 'autonomous'
  timestamp: number
}

/**
 * Filas por container (containerId -> Queue)
 */
const queues = new Map<string, Queue<InstructionJobData>>()

/**
 * Queue Events por container (containerId -> QueueEvents)
 */
const queueEvents = new Map<string, QueueEvents>()

/**
 * Obtém ou cria fila para um container
 * Cria automaticamente o worker correspondente
 */
function getQueue(containerId: string): Queue<InstructionJobData> {
  const validated = validateContainerId(containerId)

  if (queues.has(validated)) {
    return queues.get(validated)!
  }

  logger.info({ containerId: validated }, 'Creating Claude instruction queue')

  const queueName = `claude-instructions-${validated}`
  const connection = getRedisConnection()

  const queue = new Queue<InstructionJobData>(queueName, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: {
        age: 3600, // Keep completed jobs for 1 hour
        count: 100, // Keep last 100 completed jobs
      },
      removeOnFail: {
        age: 86400, // Keep failed jobs for 24 hours for debugging
      },
    },
  })

  // Criar QueueEvents para monitoramento
  const events = new QueueEvents(queueName, {
    connection,
  })

  queues.set(validated, queue)
  queueEvents.set(validated, events)

  // Garantir que worker está rodando
  getOrCreateWorker(validated)

  logger.info({ containerId: validated, queueName }, 'Queue and worker created')

  return queue
}

/**
 * Adiciona instrução na fila
 *
 * @param containerId - ID do container
 * @param instruction - Instrução para Claude Code
 * @param mode - Modo de execução (interactive ou autonomous)
 * @param options - Opções adicionais do BullMQ
 * @returns Informações do job criado
 */
export async function queueInstruction(
  containerId: string,
  instruction: string,
  mode: 'interactive' | 'autonomous' = 'interactive',
  options?: Partial<JobsOptions>
): Promise<JobInfo> {
  const validated = validateContainerId(containerId)
  const safeInstruction = validateInstruction(instruction)

  const queue = getQueue(validated)

  // Check queue size limit to prevent DoS
  const status = await getQueueStatus(validated)
  if (status.waiting >= MAX_QUEUE_SIZE) {
    logger.warn(
      { containerId: validated, waiting: status.waiting, maxSize: MAX_QUEUE_SIZE },
      'Queue size limit reached'
    )
    throw new Error(`Queue for container ${validated} is full (${MAX_QUEUE_SIZE} pending jobs)`)
  }

  const jobData: InstructionJobData = {
    containerId: validated,
    instruction: safeInstruction,
    mode,
    timestamp: new Date(),
  }

  const job = await queue.add(`instruction-${Date.now()}`, jobData, {
    priority: mode === 'interactive' ? 1 : 2, // Interactive tem prioridade
    ...options,
  })

  // Obter posição na fila
  const waiting = await queue.getWaitingCount()

  logger.info(
    {
      containerId: validated,
      jobId: job.id,
      mode,
      position: waiting,
    },
    'Instruction queued'
  )

  // Emitir evento de pending via WebSocket
  const pendingData: InstructionEventData = {
    id: job.id!,
    containerId: validated,
    instruction: safeInstruction.substring(0, 200) + (safeInstruction.length > 200 ? '...' : ''),
    status: 'pending',
    createdAt: new Date(),
  }
  emitInstructionPending(pendingData)

  // Emitir stats atualizados para o container card
  const active = await queue.getActiveCount()
  emitQueueStatsUpdate(validated, {
    queueLength: waiting + active,
    activeJobs: active,
    lastActivity: new Date(),
  })

  return {
    id: job.id!,
    position: waiting,
    status: 'queued',
  }
}

/**
 * Obtém status da fila de um container
 *
 * @param containerId - ID do container
 * @returns Métricas da fila
 */
export async function getQueueStatus(containerId: string): Promise<QueueStatus> {
  const validated = validateContainerId(containerId)
  const queue = getQueue(validated)

  const [waiting, active, completed, failed, delayed, isPaused] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
    queue.isPaused(),
  ])

  return { waiting, active, completed, failed, delayed, isPaused }
}

/**
 * Obtém jobs pendentes na fila
 *
 * @param containerId - ID do container
 * @param limit - Número máximo de jobs a retornar
 * @returns Lista de jobs pendentes
 */
export async function getPendingJobs(
  containerId: string,
  limit = 10
): Promise<PendingJob[]> {
  const validated = validateContainerId(containerId)
  const queue = getQueue(validated)

  const jobs = await queue.getWaiting(0, limit - 1)

  return jobs.map((job) => ({
    id: job.id,
    instruction: job.data.instruction.substring(0, 100) + '...',
    mode: job.data.mode,
    timestamp: job.timestamp,
  }))
}

/**
 * Cancela um job específico
 * Só pode cancelar jobs que estão waiting ou delayed
 *
 * @param containerId - ID do container
 * @param jobId - ID do job
 * @returns true se cancelado com sucesso, false se não encontrado ou já processado
 */
export async function cancelJob(containerId: string, jobId: string): Promise<boolean> {
  const validated = validateContainerId(containerId)
  const queue = getQueue(validated)

  const job = await queue.getJob(jobId)
  if (!job) {
    logger.warn({ containerId: validated, jobId }, 'Job not found for cancellation')
    return false
  }

  const state = await job.getState()
  if (state === 'waiting' || state === 'delayed') {
    await job.remove()
    logger.info({ containerId: validated, jobId, state }, 'Job cancelled')
    return true
  }

  logger.warn({ containerId: validated, jobId, state }, 'Cannot cancel job in this state')
  return false
}

/**
 * Pausa fila de um container
 * Jobs ativos continuam executando, mas novos não são processados
 *
 * @param containerId - ID do container
 */
export async function pauseQueue(containerId: string): Promise<void> {
  const validated = validateContainerId(containerId)
  const queue = getQueue(validated)
  await queue.pause()
  logger.info({ containerId: validated }, 'Queue paused')
}

/**
 * Resume fila de um container
 *
 * @param containerId - ID do container
 */
export async function resumeQueue(containerId: string): Promise<void> {
  const validated = validateContainerId(containerId)
  const queue = getQueue(validated)
  await queue.resume()
  logger.info({ containerId: validated }, 'Queue resumed')
}

/**
 * Limpa fila de um container
 * Remove todos os jobs pending (waiting + delayed)
 *
 * @param containerId - ID do container
 * @returns Número de jobs removidos
 */
export async function clearQueue(containerId: string): Promise<number> {
  const validated = validateContainerId(containerId)
  const queue = getQueue(validated)

  const [waiting, delayed] = await Promise.all([queue.getWaiting(), queue.getDelayed()])

  const allJobs = [...waiting, ...delayed]
  await Promise.all(allJobs.map((job) => job.remove()))

  logger.info({ containerId: validated, removed: allJobs.length }, 'Queue cleared')

  return allJobs.length
}

/**
 * Para fila e worker de um container
 * Fecha todas as conexões e limpa recursos
 *
 * @param containerId - ID do container
 */
export async function destroyQueue(containerId: string): Promise<void> {
  const validated = validateContainerId(containerId)

  // Parar worker
  await stopWorker(validated)

  // Fechar eventos
  const events = queueEvents.get(validated)
  if (events) {
    await events.close()
    queueEvents.delete(validated)
  }

  // Fechar fila
  const queue = queues.get(validated)
  if (queue) {
    await queue.close()
    queues.delete(validated)
  }

  logger.info({ containerId: validated }, 'Queue destroyed')
}

/**
 * Para todas as filas e workers
 * Usado no shutdown graceful do servidor
 */
export async function destroyAllQueues(): Promise<void> {
  const containerIds = Array.from(queues.keys())
  await Promise.all(containerIds.map(destroyQueue))
  logger.info({ count: containerIds.length }, 'All queues destroyed')
}

/**
 * Lista container IDs com filas ativas
 *
 * @returns Array de container IDs
 */
export function getActiveQueues(): string[] {
  return Array.from(queues.keys())
}

/**
 * Obtém detalhes de um job específico
 *
 * @param containerId - ID do container
 * @param jobId - ID do job
 * @returns Detalhes do job ou null se não encontrado
 */
export async function getJob(containerId: string, jobId: string): Promise<JobDetails | null> {
  const validated = validateContainerId(containerId)
  const queue = getQueue(validated)

  const job = await queue.getJob(jobId)
  if (!job) {
    return null
  }

  const state = await job.getState()
  const progress = job.progress as { percentage?: number; message?: string; timestamp?: Date } | undefined

  return {
    id: job.id!,
    instruction: job.data.instruction,
    mode: job.data.mode,
    status: state,
    progress: progress && typeof progress === 'object' ? {
      percentage: progress.percentage || 0,
      message: progress.message || '',
      timestamp: progress.timestamp || new Date(),
    } : undefined,
    result: job.returnvalue as JobDetails['result'],
    error: job.failedReason || undefined,
    attemptsMade: job.attemptsMade,
    maxAttempts: job.opts.attempts || 3,
    createdAt: new Date(job.timestamp),
    processedAt: job.processedOn ? new Date(job.processedOn) : undefined,
    finishedAt: job.finishedOn ? new Date(job.finishedOn) : undefined,
  }
}

/**
 * Obtém histórico de jobs de um container
 *
 * @param containerId - ID do container
 * @param limit - Número máximo de jobs a retornar (default: 50)
 * @returns Lista de jobs ordenados por data de criação (mais recentes primeiro)
 */
export async function getJobHistory(
  containerId: string,
  limit: number = 50
): Promise<JobHistoryItem[]> {
  const validated = validateContainerId(containerId)
  const queue = getQueue(validated)

  // Buscar jobs de todos os estados
  // IMPORTANTE: 'prioritized' é usado quando jobs têm priority definida
  const [waiting, prioritized, active, completed, failed, delayed] = await Promise.all([
    queue.getJobs(['waiting'], 0, limit),
    queue.getJobs(['prioritized'], 0, limit),
    queue.getJobs(['active'], 0, limit),
    queue.getJobs(['completed'], 0, limit),
    queue.getJobs(['failed'], 0, limit),
    queue.getJobs(['delayed'], 0, limit),
  ])

  const allJobs = [...waiting, ...prioritized, ...active, ...completed, ...failed, ...delayed]

  // Ordenar por timestamp descendente (mais recentes primeiro)
  allJobs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))

  // Limitar resultado
  const limitedJobs = allJobs.slice(0, limit)

  // Mapear para formato simplificado
  const history: JobHistoryItem[] = await Promise.all(
    limitedJobs.map(async (job) => {
      const state = await job.getState()
      const duration = job.finishedOn && job.processedOn
        ? job.finishedOn - job.processedOn
        : undefined

      return {
        id: job.id!,
        instruction: job.data.instruction.substring(0, 200) + (job.data.instruction.length > 200 ? '...' : ''),
        mode: job.data.mode,
        status: state,
        createdAt: new Date(job.timestamp),
        finishedAt: job.finishedOn ? new Date(job.finishedOn) : undefined,
        duration,
        error: job.failedReason || undefined,
      }
    })
  )

  return history
}

/**
 * Retenta um job que falhou
 *
 * @param containerId - ID do container
 * @param jobId - ID do job
 * @returns true se o retry foi iniciado, false se o job não pode ser retentado
 */
export async function retryJob(containerId: string, jobId: string): Promise<boolean> {
  const validated = validateContainerId(containerId)
  const queue = getQueue(validated)

  const job = await queue.getJob(jobId)
  if (!job) {
    logger.warn({ containerId: validated, jobId }, 'Job not found for retry')
    return false
  }

  const state = await job.getState()
  if (state !== 'failed') {
    logger.warn({ containerId: validated, jobId, state }, 'Cannot retry job in this state')
    return false
  }

  // Retentar o job
  await job.retry()
  logger.info({ containerId: validated, jobId }, 'Job retry initiated')

  return true
}

/**
 * Deleta um job concluído ou falho do histórico
 * Só permite deletar jobs com status 'completed' ou 'failed'
 *
 * @param containerId - ID do container
 * @param jobId - ID do job
 * @returns true se deletado com sucesso, false se não encontrado ou não pode ser deletado
 */
export async function deleteJob(containerId: string, jobId: string): Promise<boolean> {
  const validated = validateContainerId(containerId)
  const queue = getQueue(validated)

  const job = await queue.getJob(jobId)
  if (!job) {
    logger.warn({ containerId: validated, jobId }, 'Job não encontrado para deleção')
    return false
  }

  const state = await job.getState()
  if (state !== 'completed' && state !== 'failed') {
    logger.warn({ containerId: validated, jobId, state }, 'Não é possível deletar job neste estado. Apenas completed ou failed podem ser deletados.')
    return false
  }

  await job.remove()
  logger.info({ containerId: validated, jobId, state }, 'Job deletado do histórico')

  // Emitir stats atualizados
  const stats = await getQueueStatus(validated)
  emitQueueStatsUpdate(validated, {
    queueLength: stats.waiting + stats.active,
    activeJobs: stats.active,
    lastActivity: new Date(),
  })

  return true
}

/**
 * Move job para Dead Letter Queue (DLQ)
 * Chamado automaticamente quando um job excede o número máximo de tentativas
 *
 * @param containerId - ID do container
 * @param job - Job que falhou
 * @param error - Mensagem de erro
 */
export async function moveToDeadLetterQueue(
  containerId: string,
  job: Job<InstructionJobData>,
  error: string
): Promise<void> {
  const validated = validateContainerId(containerId)

  logger.error({
    containerId: validated,
    jobId: job.id,
    error,
    attemptsMade: job.attemptsMade,
  }, 'Moving job to Dead Letter Queue')

  // Emitir evento de falha permanente via WebSocket
  const failedData: InstructionEventData = {
    id: job.id || 'unknown',
    containerId: validated,
    instruction: job.data.instruction,
    status: 'failed',
    createdAt: new Date(job.timestamp),
    completedAt: new Date(),
    error: `[DLQ] ${error} - Todas as ${job.attemptsMade} tentativas falharam`,
  }
  emitInstructionFailed(failedData)

  // Por agora, apenas loga. Futuro: persistir em SQLite para auditoria
  // TODO: Implementar persistência SQLite para DLQ
}

/**
 * Obtém jobs na Dead Letter Queue (jobs que falharam todas as tentativas)
 *
 * @param containerId - ID do container
 * @param limit - Número máximo de jobs a retornar
 * @returns Lista de jobs na DLQ
 */
export async function getDeadLetterJobs(
  containerId: string,
  limit: number = 20
): Promise<JobHistoryItem[]> {
  const validated = validateContainerId(containerId)
  const queue = getQueue(validated)

  // Jobs falhos são mantidos por 24h (configurado no defaultJobOptions)
  const failedJobs = await queue.getJobs(['failed'], 0, limit * 2)

  // Filtrar apenas jobs que excederam todas as tentativas
  const dlqJobs = failedJobs.filter((job) => {
    const maxAttempts = job.opts.attempts || 3
    return job.attemptsMade >= maxAttempts
  })

  // Ordenar e limitar
  dlqJobs.sort((a, b) => (b.finishedOn || 0) - (a.finishedOn || 0))
  const limitedJobs = dlqJobs.slice(0, limit)

  return limitedJobs.map((job) => ({
    id: job.id!,
    instruction: job.data.instruction.substring(0, 200) + (job.data.instruction.length > 200 ? '...' : ''),
    mode: job.data.mode,
    status: 'dead-letter',
    createdAt: new Date(job.timestamp),
    finishedAt: job.finishedOn ? new Date(job.finishedOn) : undefined,
    error: job.failedReason || 'Unknown error',
  }))
}
