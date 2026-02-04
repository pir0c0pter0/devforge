import { Queue, QueueEvents, JobsOptions } from 'bullmq'
import { logger } from '../utils/logger'
import { validateContainerId, validateInstruction } from '../validators/claude.validators'
import { getOrCreateWorker, stopWorker } from '../workers/claude.worker'
import { getRedisConnection } from '../utils/redis'
import type { InstructionJobData } from '@claude-docker/shared'

/**
 * Estrutura simplificada de informações do job
 */
export interface JobInfo {
  id: string
  position: number
  status: string
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
        count: 100, // Manter últimos 100 jobs completos
        age: 3600, // Ou jobs com menos de 1 hora
      },
      removeOnFail: {
        count: 50, // Manter últimos 50 jobs com falha
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
