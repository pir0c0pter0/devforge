import { Router, Request, Response } from 'express'
import { taskService } from '../../services/task.service'
import { apiLogger as logger } from '../../utils/logger'

const router: Router = Router()

/**
 * API response helper
 */
const successResponse = (data: any, message?: string) => ({
  success: true,
  data,
  ...(message && { message }),
})

const errorResponse = (error: string, statusCode: number = 500) => ({
  success: false,
  error,
  statusCode,
})

/**
 * GET /api/tasks
 * List all tasks
 */
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    logger.debug('Listing all tasks')
    const tasks = taskService.getAll()
    res.json(successResponse(tasks))
  } catch (error) {
    logger.error({ error }, 'Failed to list tasks')
    res.status(500).json(
      errorResponse(
        error instanceof Error ? error.message : 'Failed to list tasks',
        500
      )
    )
  }
})

/**
 * GET /api/tasks/:id
 * Get task by ID
 */
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const taskId = req.params['id'] as string
    logger.debug({ taskId }, 'Getting task by ID')

    const task = taskService.get(taskId)
    if (!task) {
      logger.warn({ taskId }, 'Task not found')
      res.status(404).json(errorResponse('Task não encontrada', 404))
      return
    }

    res.json(successResponse(task))
  } catch (error) {
    logger.error({ error, taskId: req.params['id'] }, 'Failed to get task')
    res.status(500).json(
      errorResponse(
        error instanceof Error ? error.message : 'Failed to get task',
        500
      )
    )
  }
})

/**
 * DELETE /api/tasks/:id
 * Delete task
 */
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const taskId = req.params['id'] as string
    logger.info({ taskId }, 'Deleting task')

    const deleted = taskService.delete(taskId)
    if (!deleted) {
      logger.warn({ taskId }, 'Task not found for deletion')
      res.status(404).json(errorResponse('Task não encontrada', 404))
      return
    }

    res.json(successResponse({ id: taskId, deleted: true }, 'Task removida'))
  } catch (error) {
    logger.error({ error, taskId: req.params['id'] }, 'Failed to delete task')
    res.status(500).json(
      errorResponse(
        error instanceof Error ? error.message : 'Failed to delete task',
        500
      )
    )
  }
})

export default router
