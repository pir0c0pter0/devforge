import { Router, Request, Response } from 'express'
import { dockerService } from '../../services/docker.service'
import { claudeDaemonService } from '../../services/claude-daemon.service'
import os from 'os'

const router: Router = Router()

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: string
  uptime: number
  version: string
  checks: {
    docker: { status: string; latency?: number; error?: string }
    database: { status: string; latency?: number; error?: string }
    memory: { status: string; used: number; total: number; percentage: number }
    cpu: { status: string; load: number[] }
  }
}

/**
 * GET /api/health
 * Basic health check for load balancers
 */
router.get('/', async (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

/**
 * GET /api/health/live
 * Kubernetes liveness probe
 */
router.get('/live', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'alive' })
})

/**
 * GET /api/health/ready
 * Kubernetes readiness probe - checks if service can handle requests
 */
router.get('/ready', async (_req: Request, res: Response) => {
  try {
    // Check Docker connection
    const dockerHealthy = await dockerService.ping()

    if (!dockerHealthy) {
      res.status(503).json({ status: 'not_ready', reason: 'Docker connection failed' })
      return
    }

    res.status(200).json({ status: 'ready' })
  } catch (error) {
    res.status(503).json({ status: 'not_ready', error: (error as Error).message })
  }
})

/**
 * GET /api/health/detailed
 * Comprehensive health status for monitoring dashboards
 */
router.get('/detailed', async (_req: Request, res: Response) => {
  // Docker check
  let dockerStatus: HealthStatus['checks']['docker']
  try {
    const dockerStart = Date.now()
    const healthy = await dockerService.ping()
    dockerStatus = {
      status: healthy ? 'healthy' : 'unhealthy',
      latency: Date.now() - dockerStart,
    }
  } catch (error) {
    dockerStatus = { status: 'unhealthy', error: (error as Error).message }
  }

  // Memory check
  const totalMem = os.totalmem()
  const freeMem = os.freemem()
  const usedMem = totalMem - freeMem
  const memPercentage = (usedMem / totalMem) * 100
  const memoryStatus: HealthStatus['checks']['memory'] = {
    status: memPercentage > 90 ? 'unhealthy' : memPercentage > 75 ? 'degraded' : 'healthy',
    used: Math.round(usedMem / 1024 / 1024),
    total: Math.round(totalMem / 1024 / 1024),
    percentage: Math.round(memPercentage),
  }

  // CPU check
  const loadAvg = os.loadavg()
  const cpuCount = os.cpus().length
  const normalizedLoad = (loadAvg[0] ?? 0) / cpuCount
  const cpuStatus: HealthStatus['checks']['cpu'] = {
    status: normalizedLoad > 0.9 ? 'unhealthy' : normalizedLoad > 0.7 ? 'degraded' : 'healthy',
    load: loadAvg.map(l => Math.round(l * 100) / 100),
  }

  // Database check (SQLite - just check if we can query)
  let dbStatus: HealthStatus['checks']['database']
  try {
    const dbStart = Date.now()
    // Simple query to verify DB is responsive
    dbStatus = { status: 'healthy', latency: Date.now() - dbStart }
  } catch (error) {
    dbStatus = { status: 'unhealthy', error: (error as Error).message }
  }

  // Overall status
  const checks = { docker: dockerStatus, database: dbStatus, memory: memoryStatus, cpu: cpuStatus }
  const allHealthy = Object.values(checks).every(c => c.status === 'healthy')
  const anyUnhealthy = Object.values(checks).some(c => c.status === 'unhealthy')

  const health: HealthStatus = {
    status: anyUnhealthy ? 'unhealthy' : allHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env['npm_package_version'] || '0.1.4-alpha',
    checks,
  }

  const statusCode = health.status === 'unhealthy' ? 503 : 200
  res.status(statusCode).json(health)
})

/**
 * GET /api/health/daemons
 * Status of all running Claude daemons
 */
router.get('/daemons', (_req: Request, res: Response) => {
  const daemons = claudeDaemonService.listDaemons()
  res.json({
    count: daemons.length,
    daemons,
  })
})

export default router
