# Quick Start Guide - Claude Docker

Get up and running with Claude Docker in 5 minutes.

## Prerequisites

- Docker Engine 20.10+
- Docker Compose 2.0+
- 4GB+ RAM available
- Anthropic API key

## Step 1: Clone and Setup

```bash
# Navigate to project
cd /path/to/claude-docker

# Copy environment file
cp docker/.env.example docker/.env

# Edit .env and add your API key
nano docker/.env
# Set: ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxx
```

## Step 2: Choose Your Setup

### Option A: Production (Backend + Frontend + Redis)

```bash
cd docker

# Build and start services
make quick-start

# Or manually:
make build
make up
```

Access:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- Redis: localhost:6379

### Option B: Development (All services + VS Code Server)

```bash
cd docker

# Start development environment
make dev

# Or:
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

Access:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- VS Code Server: http://localhost:8080
- Redis: localhost:6379

### Option C: Standalone Dev Container (Claude Code + VS Code)

```bash
cd docker

# Build combined image
make build-both

# Run container
docker run -d \
  --name my-dev-env \
  -p 8080:8080 \
  -v $PWD/..:/workspace \
  -v ~/.claude:/home/developer/.claude \
  -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  claude-docker/both:latest

# Open VS Code Server
open http://localhost:8080

# Or exec into container
docker exec -it my-dev-env /bin/zsh
```

## Step 3: Verify Installation

```bash
# Check running containers
make ps

# View logs
make logs

# Check health
make health

# Show URLs
make urls
```

## Step 4: Start Developing

### Using VS Code Server:
1. Open http://localhost:8080
2. Navigate to workspace
3. Start coding!

### Using Claude Code CLI:
```bash
# Exec into devtools container
make shell

# Run Claude Code
npx @anthropic-ai/claude-code

# Or directly
docker exec -it claude-docker-devtools npx @anthropic-ai/claude-code
```

### Using Backend API:
```bash
# Check health
curl http://localhost:8000/health

# Create container (example)
curl -X POST http://localhost:8000/api/containers \
  -H "Content-Type: application/json" \
  -d '{"image": "claude-docker/both:latest", "name": "my-container"}'
```

## Common Commands

```bash
# Start services
make up              # Production mode
make up-dev          # Development mode

# Stop services
make down

# Restart
make restart

# View logs
make logs            # All services
make logs-backend    # Backend only
make logs-frontend   # Frontend only

# Shell access
make shell           # Devtools container
make shell-backend   # Backend container
make shell-frontend  # Frontend container

# Build images
make build           # All images
make build-claude    # Claude Code only
make build-vscode    # VS Code only
make build-both      # Combined image

# Clean up
make clean           # Remove containers and images
make clean-volumes   # Remove volumes
make clean-all       # Everything
```

## Troubleshooting

### Port already in use:
```bash
# Check what's using the port
sudo lsof -i :8080

# Kill the process or change port in docker-compose.yml
```

### Permission denied:
```bash
# Add user to docker group
sudo usermod -aG docker $USER
newgrp docker

# Or run with sudo (not recommended)
sudo make up
```

### Container won't start:
```bash
# Check logs
make logs

# Check Docker daemon
sudo systemctl status docker

# Restart Docker
sudo systemctl restart docker
```

### Out of memory:
```bash
# Check Docker resource usage
docker stats

# Increase Docker memory limit
# Docker Desktop: Settings > Resources > Memory > 4GB+
```

### Build fails:
```bash
# Clean and rebuild
make clean
make build --no-cache

# Or
./build-images.sh --no-cache all
```

## Environment Variables

Essential variables in `.env`:

```bash
# Required
ANTHROPIC_API_KEY=sk-ant-xxx

# Optional
NODE_ENV=production
LOG_LEVEL=info
NEXT_PUBLIC_API_URL=http://localhost:8000
REDIS_URL=redis://redis:6379
```

## Next Steps

1. **Read full documentation**: See `README.md`
2. **Configure Claude Code**: Edit `~/.claude/` settings
3. **Customize images**: Modify Dockerfiles in `base-image/`
4. **Add extensions**: Install VS Code extensions via web UI
5. **Deploy to production**: Use environment-specific configs

## Getting Help

- Check `README.md` for detailed documentation
- View `Makefile` for all available commands
- Run `make help` for command reference
- Check logs with `make logs`

## Clean Up

When you're done:

```bash
# Stop containers
make down

# Remove everything
make clean-all
```

## Production Deployment

For production deployment:

1. Update `.env` with production values
2. Configure reverse proxy (nginx/traefik)
3. Enable HTTPS/TLS
4. Set proper resource limits
5. Configure backups for volumes
6. Set up monitoring/logging

See `README.md` section "Production Deployment" for details.

---

**Need help?** Check the main README.md or run `make help`
