# DevForge - Backend API

Backend API for AI-powered container orchestration with Claude Code + VS Code integration.

## Overview

This is a production-ready Express + TypeScript backend that provides REST API endpoints and WebSocket support for managing Docker containers with Claude Code and VS Code.

## Tech Stack

- **Express** - Web framework
- **TypeScript** - Type safety with strict mode
- **Dockerode** - Docker API client
- **Socket.io** - Real-time WebSocket communication
- **BullMQ** - Queue management (ready for future use)
- **Zod** - Runtime validation
- **Pino** - Structured logging
- **Redis** - Queue backend (optional)

## Project Structure

```
packages/backend/
├── src/
│   ├── models/              # Data models with Zod validation
│   │   ├── container.model.ts
│   │   └── instruction.model.ts
│   ├── services/            # Business logic layer
│   │   ├── docker.service.ts      # Docker operations
│   │   ├── container.service.ts   # Container management
│   │   └── metrics.service.ts     # Real-time metrics
│   ├── api/routes/          # REST API endpoints
│   │   └── containers.routes.ts
│   ├── utils/               # Utilities
│   │   ├── logger.ts              # Pino logging
│   │   └── validation.ts          # Zod middleware
│   └── index.ts             # Main entry point
├── package.json
├── tsconfig.json
└── .env.example
```

## Features

### Container Management
- Create containers with custom configurations
- Start/stop/delete containers
- List all containers with metrics
- Get container details
- Real-time container logs
- SSH key support for Git operations

### Real-time Metrics
- CPU usage (percentage)
- Memory usage (MB and percentage)
- Disk usage
- Network I/O
- Active Claude agent detection
- WebSocket streaming support

### Container Configuration
- **Templates**: claude, vscode, both
- **Modes**: interactive, autonomous
- **Repository**: empty or clone from URL
- **Resources**: CPU, memory, and disk limits
- **SSH Keys**: Support for private repositories

### REST API Endpoints

#### Containers
- `GET /api/containers` - List all containers
- `POST /api/containers` - Create new container
- `GET /api/containers/:id` - Get container details
- `POST /api/containers/:id/start` - Start container
- `POST /api/containers/:id/stop` - Stop container
- `DELETE /api/containers/:id` - Delete container
- `GET /api/containers/:id/metrics` - Get real-time metrics
- `GET /api/containers/:id/logs` - Get container logs

#### Health Check
- `GET /health` - API and Docker daemon health

### WebSocket Events

#### Client → Server
- `subscribe:metrics` - Subscribe to container metrics
- `unsubscribe:metrics` - Unsubscribe from metrics
- `subscribe:logs` - Subscribe to container logs
- `subscribe:status` - Subscribe to status updates

#### Server → Client
- `metrics:update` - Real-time metrics data
- `metrics:error` - Metrics error
- `logs:initial` - Initial log dump
- `logs:error` - Logs error

## Installation

```bash
cd packages/backend
pnpm install
```

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
# Server
PORT=3000
HOST=0.0.0.0
NODE_ENV=development

# CORS
CORS_ORIGIN=*

# Docker
DOCKER_SOCKET_PATH=/var/run/docker.sock

# Redis (optional, for BullMQ)
REDIS_URL=redis://localhost:6379

# Logging
LOG_LEVEL=debug
```

## Development

```bash
# Development with hot reload
pnpm dev

# Type checking
pnpm type-check

# Build
pnpm build

# Production
pnpm start
```

## API Usage Examples

### Create Container

```bash
curl -X POST http://localhost:3000/api/containers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-dev-container",
    "template": "both",
    "mode": "interactive",
    "repoType": "clone",
    "repoUrl": "git@github.com:user/repo.git",
    "sshKeyPath": "~/.ssh/id_rsa",
    "cpuLimit": 2,
    "memoryLimit": 2048,
    "diskLimit": 10240
  }'
```

### List Containers with Metrics

```bash
curl http://localhost:3000/api/containers?includeMetrics=true
```

### Get Container Metrics

```bash
curl http://localhost:3000/api/containers/{id}/metrics
```

### WebSocket Connection

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000');

// Subscribe to metrics
socket.emit('subscribe:metrics', {
  containerId: 'container-id',
  interval: 2000
});

// Listen for metrics updates
socket.on('metrics:update', (data) => {
  console.log('Metrics:', data.metrics);
});
```

## Code Quality

### Immutability
All code follows immutable patterns using spread operators and avoiding mutations.

### Error Handling
Comprehensive try/catch blocks with proper HTTP status codes and error messages.

### Input Validation
All inputs validated with Zod schemas before processing.

### Logging
Structured logging with Pino for all operations.

### Type Safety
Strict TypeScript configuration with full type coverage.

## Architecture Decisions

### Service Layer Pattern
Business logic separated from routes for better testability and reusability.

### Validation Middleware
Centralized Zod validation middleware for consistent error handling.

### Singleton Services
Services exported as singletons for consistent state management.

### Immutable Data
All data transformations create new objects rather than mutating existing ones.

## Future Enhancements

- BullMQ queue integration for async operations
- Real-time log streaming via WebSocket
- Docker events API integration
- Container status change notifications
- Rate limiting middleware
- Authentication/authorization
- Database persistence
- Prometheus metrics export

## License

MIT
