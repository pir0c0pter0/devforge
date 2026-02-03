import { Router, Request, Response } from 'express'
import { z } from 'zod'
import {
  addInstruction,
  getQueueStatus,
  getJobHistory,
  getJob,
  cancelJob,
  retryJob,
  clearQueue,
} from '../../services/queue.service'
import { createWorker } from '../../workers/instruction.worker'
import { emitInstructionPending } from '../../services/websocket.service'
import { validateParams, validateBody, validateQuery, asyncHandler } from '../../middleware/validation.middleware'
import type { InstructionEventData } from '@claude-docker/shared'

const router: Router = Router()

/**
 * Validation schemas
 */
const containerIdSchema = z.object({
  containerId: z.string().min(1, 'Container ID is required'),
})

const jobIdSchema = z.object({
  jobId: z.string().min(1, 'Job ID is required'),
})

const addInstructionSchema = z.object({
  instruction: z.string().min(1, 'Instruction cannot be empty'),
  mode: z.enum(['interactive', 'autonomous']).default('autonomous'),
})

const historyQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).default(50),
})

/**
 * Standard API response wrapper
 */
interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

const successResponse = <T>(data: T): ApiResponse<T> => ({
  success: true,
  data,
})

const errorResponse = (error: string): ApiResponse<never> => ({
  success: false,
  error,
})

/**
 * GET /api/queue/:containerId
 * Get queue status and current jobs
 */
router.get(
  '/:containerId',
  validateParams(containerIdSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { containerId } = req.params as { containerId: string }

    const status = await getQueueStatus(containerId)

    res.json(successResponse(status))
  })
)

/**
 * POST /api/queue/:containerId
 * Add instruction to queue
 */
router.post(
  '/:containerId',
  validateParams(containerIdSchema),
  validateBody(addInstructionSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { containerId } = req.params as { containerId: string }
    const { instruction, mode } = req.body as { instruction: string; mode: 'interactive' | 'autonomous' }

    // Ensure worker exists for this container
    createWorker(containerId)

    // Add instruction to queue
    const job = await addInstruction(containerId, instruction, mode)

    // Emit pending event
    const pendingData: InstructionEventData = {
      id: job.id as string,
      containerId,
      instruction,
      status: 'pending',
      createdAt: new Date(job.timestamp),
    }
    emitInstructionPending(pendingData)

    res.status(201).json(successResponse(job))
  })
)

/**
 * DELETE /api/queue/:containerId
 * Clear entire queue
 */
router.delete(
  '/:containerId',
  validateParams(containerIdSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { containerId } = req.params as { containerId: string }

    await clearQueue(containerId)

    res.json(successResponse({ message: 'Queue cleared successfully' }))
  })
)

/**
 * GET /api/queue/:containerId/history
 * Get job history
 */
router.get(
  '/:containerId/history',
  validateParams(containerIdSchema),
  validateQuery(historyQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { containerId } = req.params as { containerId: string }
    const { limit } = req.query as { limit?: number }

    const history = await getJobHistory(containerId, limit ?? 50)

    res.json(successResponse(history))
  })
)

/**
 * GET /api/queue/:containerId/jobs/:jobId
 * Get specific job details
 */
router.get(
  '/:containerId/jobs/:jobId',
  validateParams(containerIdSchema.merge(jobIdSchema)),
  asyncHandler(async (req: Request, res: Response) => {
    const { containerId, jobId } = req.params as { containerId: string; jobId: string }

    const job = await getJob(containerId, jobId)

    if (!job) {
      res.status(404).json(errorResponse('Job not found'))
      return
    }

    res.json(successResponse(job))
  })
)

/**
 * POST /api/queue/:containerId/jobs/:jobId/cancel
 * Cancel pending or active job
 */
router.post(
  '/:containerId/jobs/:jobId/cancel',
  validateParams(containerIdSchema.merge(jobIdSchema)),
  asyncHandler(async (req: Request, res: Response) => {
    const { containerId, jobId } = req.params as { containerId: string; jobId: string }

    try {
      await cancelJob(containerId, jobId)
      res.json(successResponse({ message: 'Job cancelled successfully' }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to cancel job'
      res.status(400).json(errorResponse(message))
    }
  })
)

/**
 * POST /api/queue/:containerId/jobs/:jobId/retry
 * Retry failed job
 */
router.post(
  '/:containerId/jobs/:jobId/retry',
  validateParams(containerIdSchema.merge(jobIdSchema)),
  asyncHandler(async (req: Request, res: Response) => {
    const { containerId, jobId } = req.params as { containerId: string; jobId: string }

    try {
      const job = await retryJob(containerId, jobId)
      res.json(successResponse(job))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to retry job'
      res.status(400).json(errorResponse(message))
    }
  })
)

/**
 * Error handler for this router
 */
router.use((err: Error, _req: Request, res: Response) => {
  console.error('[Queue Routes] Error:', err)
  res.status(500).json(errorResponse(err.message || 'Internal server error'))
})

export default router
