# Claude Docker - Base Images

Production-ready Docker base images for Claude Code and VS Code development environments.

## Available Images

### 1. Claude Code Only (`Dockerfile.claude`)
Minimal image with Claude Code CLI and development tools.

**Includes:**
- Node.js 22 (Bookworm)
- Claude Code CLI (via pnpm)
- Git, curl, wget, vim, nano
- GitHub CLI (gh)
- Oh My Zsh
- pnpm package manager

**Ports:** 3000, 5173

### 2. VS Code Server Only (`Dockerfile.vscode`)
VS Code Server (code-server) for web-based IDE access.

**Includes:**
- Node.js 22 (Bookworm)
- code-server 4.23.1
- All development tools
- Passwordless access (configured for container use)

**Ports:** 8080

### 3. Combined (`Dockerfile.both`)
Full-featured image with both Claude Code and VS Code Server.

**Includes:**
- All features from both images
- Startup script for multi-service management
- tmux, htop for process management

**Ports:** 3000, 5173, 8080

## Building Images

### Build individual images:
```bash
# Claude Code only
docker build -f base-image/Dockerfile.claude -t claude-docker/claude:latest base-image/

# VS Code Server only
docker build -f base-image/Dockerfile.vscode -t claude-docker/vscode:latest base-image/

# Combined image
docker build -f base-image/Dockerfile.both -t claude-docker/both:latest base-image/
```

### Build with custom user ID:
```bash
docker build \
  --build-arg USER_UID=$(id -u) \
  --build-arg USER_GID=$(id -g) \
  -f base-image/Dockerfile.both \
  -t claude-docker/both:latest \
  base-image/
```

## Running Containers

### Quick start with docker-compose:

**Production mode:**
```bash
docker-compose up -d
```

**Development mode (with hot reload):**
```bash
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up
```

### Run standalone containers:

**Claude Code container:**
```bash
docker run -it --rm \
  -v $PWD:/home/developer/workspace \
  -v ~/.claude:/home/developer/.claude \
  -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  claude-docker/claude:latest
```

**VS Code Server container:**
```bash
docker run -d --rm \
  -p 8080:8080 \
  -v $PWD:/home/developer/workspace \
  claude-docker/vscode:latest
```

**Combined container:**
```bash
docker run -d --rm \
  -p 3000:3000 \
  -p 5173:5173 \
  -p 8080:8080 \
  -v $PWD:/home/developer/workspace \
  -v ~/.claude:/home/developer/.claude \
  -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  claude-docker/both:latest
```

## Docker Compose Services

### Main Services (docker-compose.yml)

- **backend**: API server (port 8000)
- **frontend**: Next.js web UI (port 3000)
- **redis**: Cache and session storage (port 6379)

### Development Services (docker-compose.dev.yml)

All main services plus:
- **devtools**: Combined Claude Code + VS Code Server container
  - VS Code Server: http://localhost:8080
  - Vite dev server: http://localhost:5173

## Configuration

### Environment Variables

Create `.env` file:
```bash
# Required
ANTHROPIC_API_KEY=sk-ant-xxx

# Optional
NODE_ENV=production
LOG_LEVEL=info
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
```

### VS Code Server Configuration

Edit `base-image/config.yaml` to customize code-server settings:
- Authentication
- Extensions directory
- User data directory
- Bind address

## Security Features

- **Non-root user**: All containers run as `developer` (UID 1000)
- **Read-only mounts**: SSH keys and Claude config mounted read-only
- **Capability dropping**: Minimal container capabilities
- **No privilege escalation**: `no-new-privileges:true`
- **Resource limits**: CPU and memory limits enforced

## Volume Mounts

### Production:
- `/var/run/docker.sock` - Docker socket (read-only)
- `~/.ssh` - SSH keys (read-only)
- `~/.claude` - Claude configuration (read-only)
- `redis_data` - Redis persistent storage
- `backend_logs` - Backend application logs

### Development:
- `../packages/backend:/app` - Backend source (hot reload)
- `../packages/frontend:/app` - Frontend source (hot reload)
- `../:/workspace` - Full workspace access (devtools)

## Health Checks

All services include health checks:
- **Backend**: HTTP GET `/health` (30s interval)
- **Frontend**: HTTP GET `/` (30s interval)
- **Redis**: `redis-cli ping` (10s interval)
- **VS Code Server**: HTTP GET `/healthz` (30s interval)

## Resource Limits

### Production:
- **Backend**: 2 CPU, 2GB RAM
- **Frontend**: 1 CPU, 1GB RAM
- **Redis**: 0.5 CPU, 512MB RAM

### Development:
- **Backend**: 4 CPU, 4GB RAM
- **Frontend**: 2 CPU, 2GB RAM
- **Devtools**: 4 CPU, 4GB RAM

## Troubleshooting

### Container won't start:
```bash
# Check logs
docker-compose logs -f backend

# Check container status
docker-compose ps

# Restart services
docker-compose restart
```

### Permission issues:
```bash
# Rebuild with matching UID/GID
docker-compose build --build-arg USER_UID=$(id -u) --build-arg USER_GID=$(id -g)
```

### Port conflicts:
```bash
# Check what's using the port
sudo lsof -i :8080

# Change port in docker-compose.yml or use different port
docker-compose up --force-recreate
```

### VS Code Server not accessible:
```bash
# Check if container is running
docker ps | grep devtools

# Check logs
docker logs claude-docker-devtools

# Verify port mapping
docker port claude-docker-devtools
```

## Cleanup

### Stop and remove containers:
```bash
docker-compose down
```

### Remove volumes:
```bash
docker-compose down -v
```

### Remove images:
```bash
docker rmi claude-docker/claude:latest
docker rmi claude-docker/vscode:latest
docker rmi claude-docker/both:latest
```

### Full cleanup (managed resources only):
```bash
# Remove all claude-docker managed resources
docker ps -a --filter "label=claude-docker.managed=true" -q | xargs -r docker rm -f
docker volume ls --filter "label=claude-docker.managed=true" -q | xargs -r docker volume rm
docker network ls --filter "label=claude-docker.managed=true" -q | xargs -r docker network rm
```

## Advanced Usage

### Custom startup script:
```bash
# Edit startup.sh for combined image
vim base-image/startup.sh

# Rebuild
docker-compose build devtools
```

### Add custom extensions to VS Code Server:
```bash
# Exec into container
docker exec -it claude-docker-devtools /bin/zsh

# Install extension
code-server --install-extension <extension-id>
```

### Run Claude Code interactively:
```bash
docker exec -it claude-docker-devtools /bin/zsh
npx @anthropic-ai/claude-code
```

## Labels

All resources are labeled for easy management:
- `claude-docker.managed=true` - Managed by claude-docker
- `claude-docker.service=<name>` - Service name
- `claude-docker.version=<version>` - Version
- `claude-docker.mode=<mode>` - production/development
