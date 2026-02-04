# Graceful Shutdown Implementation

## Overview

The backend now implements comprehensive graceful shutdown handling that ensures all resources are properly cleaned up when the server receives SIGTERM or SIGINT signals.

## Shutdown Sequence

When a shutdown signal is received, the following steps are executed in order:

### 1. Stop Health Monitoring
- **Service:** `healthMonitorService.stopAllMonitoring()`
- **Purpose:** Stop all health check intervals to prevent new health events during shutdown
- **Impact:** No new health checks will be initiated, preventing race conditions

### 2. Stop Active Workers (max 30s)
- **Service:** `stopAllWorkers()` from `claude.worker.ts`
- **Purpose:** Gracefully stop all BullMQ workers processing Claude instructions
- **Timeout:** 30 seconds maximum
- **Impact:** Workers finish current jobs but don't accept new ones

### 3. Stop Claude Daemons
- **Service:** `claudeDaemonService.destroy()`
- **Purpose:** Stop all Claude Code sessions and cleanup interval timers
- **Impact:** All active Claude sessions are terminated cleanly

### 4. Destroy Queue Infrastructure
- **Service:** `destroyAllQueues()` from `claude-queue.service.ts`
- **Purpose:** Close all BullMQ queues and Redis connections
- **Impact:** No new jobs can be queued, existing jobs are preserved in Redis

### 5. Close WebSocket Server
- **Service:** `getSocketServer().close()`
- **Purpose:** Close all WebSocket connections gracefully
- **Impact:** Clients receive disconnect events

### 6. Close HTTP Server
- **Service:** `httpServer.close()`
- **Purpose:** Stop accepting new HTTP connections
- **Impact:** Existing connections finish, new ones are rejected

### 7. Close Database
- **Service:** `closeDatabase()`
- **Purpose:** Close SQLite database connection
- **Impact:** All pending writes are flushed

## Health Monitor Integration

The health monitor service is now properly integrated with the WebSocket system:

### Event Flow
```
HealthMonitorService → healthMonitorService.setEventEmitter(emitClaudeEvent)
                     → WebSocket /claude-daemon namespace
                     → Frontend clients subscribed to container
```

### Event Types
- `health` - Daemon is healthy
- `recovering` - Attempting recovery (attempt N/3)
- `recovered` - Recovery successful
- `recovery_failed` - Manual intervention required (after 3 attempts)

### Configuration
- Health check interval: 30 seconds
- Max recovery attempts: 3
- Recovery delay: 5 seconds between attempts

## Files Modified

1. `/packages/backend/src/index.ts`
   - Added imports for cleanup services
   - Rewrote `gracefulShutdown()` function with proper sequencing

2. `/packages/backend/src/services/health-monitor.service.ts`
   - Added `destroy()` method to stop monitoring and cleanup

3. `/packages/backend/src/services/websocket.service.ts`
   - Already had health monitor integration (line 84)
   - No changes needed

## Testing Graceful Shutdown

To test the graceful shutdown:

```bash
# Start the server
./scripts/start.sh

# In another terminal, send SIGTERM
kill -TERM $(cat /tmp/claude-docker-backend.pid)

# Or use Ctrl+C (SIGINT) in the terminal running the server
```

Expected log output:
```
[INFO] Received shutdown signal, starting graceful shutdown
[INFO] Stopping health monitors...
[INFO] All health monitors stopped
[INFO] Waiting for active workers to finish (max 30s)...
[INFO] Worker stopped (containerId: ...)
[INFO] All workers stopped
[INFO] Stopping all Claude daemons...
[INFO] Claude session stopped (containerId: ...)
[INFO] Destroying all queues...
[INFO] Queue destroyed (containerId: ...)
[INFO] All queues destroyed
[INFO] Socket.io server closed
[INFO] HTTP server closed
[INFO] Graceful shutdown completed
```

## Error Handling

If any step fails during shutdown:
- Error is logged with details
- Shutdown continues with next step
- After 5 seconds, process forces exit(1)

This ensures the server always shuts down even if a service fails to cleanup properly.

## Benefits

1. **No Data Loss:** Jobs in flight complete or are preserved in Redis
2. **Clean Disconnects:** WebSocket clients receive proper disconnect events
3. **Resource Cleanup:** All intervals, connections, and processes are stopped
4. **Fast Restart:** Server can restart immediately without port conflicts
5. **Debugging:** Clear log output shows exact shutdown progress
