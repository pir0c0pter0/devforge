# DevForge - Makefile
# Convenient commands for building, running, and managing containers

.PHONY: help build build-claude build-vscode build-both clean clean-volumes clean-all \
        up up-dev down logs ps test shell shell-backend shell-frontend shell-devtools \
        restart restart-backend restart-frontend health push pull

# Default target
.DEFAULT_GOAL := help

# Variables
COMPOSE := docker-compose
COMPOSE_DEV := docker-compose -f docker-compose.yml -f docker-compose.dev.yml
REGISTRY := devforge
VERSION := latest

# Help target
help: ## Show this help message
	@echo "DevForge - Available Commands"
	@echo ""
	@echo "Build Commands:"
	@echo "  make build          - Build all base images"
	@echo "  make build-claude   - Build Claude Code image only"
	@echo "  make build-vscode   - Build VS Code Server image only"
	@echo "  make build-both     - Build combined image only"
	@echo ""
	@echo "Docker Compose Commands:"
	@echo "  make up             - Start all services (production mode)"
	@echo "  make up-dev         - Start all services (development mode)"
	@echo "  make down           - Stop all services"
	@echo "  make restart        - Restart all services"
	@echo "  make logs           - View logs from all services"
	@echo "  make ps             - List running containers"
	@echo ""
	@echo "Service Management:"
	@echo "  make restart-backend   - Restart backend service"
	@echo "  make restart-frontend  - Restart frontend service"
	@echo "  make shell             - Open shell in devtools container"
	@echo "  make shell-backend     - Open shell in backend container"
	@echo "  make shell-frontend    - Open shell in frontend container"
	@echo ""
	@echo "Maintenance:"
	@echo "  make clean          - Remove containers and images"
	@echo "  make clean-volumes  - Remove volumes"
	@echo "  make clean-all      - Clean everything (containers, images, volumes)"
	@echo "  make health         - Check health status of all services"
	@echo "  make test           - Run tests"
	@echo ""
	@echo "Registry Commands:"
	@echo "  make push           - Push images to registry"
	@echo "  make pull           - Pull images from registry"

# Build targets
build: ## Build all base images
	@./build-images.sh all

build-claude: ## Build Claude Code image only
	@./build-images.sh claude

build-vscode: ## Build VS Code Server image only
	@./build-images.sh vscode

build-both: ## Build combined image only
	@./build-images.sh both

build-no-cache: ## Build all images without cache
	@./build-images.sh --no-cache all

# Docker Compose targets
up: ## Start services in production mode
	@echo "Starting services in production mode..."
	@$(COMPOSE) up -d
	@echo "Services started successfully!"
	@make ps

up-dev: ## Start services in development mode
	@echo "Starting services in development mode..."
	@$(COMPOSE_DEV) up -d
	@echo "Services started successfully!"
	@echo ""
	@echo "Access URLs:"
	@echo "  Frontend:    http://localhost:3000"
	@echo "  Backend:     http://localhost:8000"
	@echo "  VS Code:     http://localhost:8080"
	@echo "  Redis:       localhost:6379"
	@make ps

down: ## Stop all services
	@echo "Stopping services..."
	@$(COMPOSE_DEV) down || $(COMPOSE) down
	@echo "Services stopped."

restart: down up ## Restart all services

logs: ## View logs from all services
	@$(COMPOSE) logs -f

logs-backend: ## View backend logs
	@$(COMPOSE) logs -f backend

logs-frontend: ## View frontend logs
	@$(COMPOSE) logs -f frontend

logs-devtools: ## View devtools logs
	@$(COMPOSE_DEV) logs -f devtools

ps: ## List running containers
	@$(COMPOSE) ps

# Service management
restart-backend: ## Restart backend service
	@$(COMPOSE) restart backend

restart-frontend: ## Restart frontend service
	@$(COMPOSE) restart frontend

restart-redis: ## Restart redis service
	@$(COMPOSE) restart redis

shell: ## Open shell in devtools container (dev mode)
	@docker exec -it devforge-devtools /bin/zsh || echo "Devtools container not running. Start with 'make up-dev'"

shell-backend: ## Open shell in backend container
	@docker exec -it devforge-backend /bin/bash || echo "Backend container not running"

shell-frontend: ## Open shell in frontend container
	@docker exec -it devforge-frontend /bin/bash || echo "Frontend container not running"

shell-redis: ## Open redis-cli
	@docker exec -it devforge-redis redis-cli

# Maintenance targets
clean: ## Remove containers and images
	@echo "Removing containers..."
	@$(COMPOSE_DEV) down -v --rmi local || $(COMPOSE) down -v --rmi local
	@echo "Removing base images..."
	@docker rmi $(REGISTRY)/claude:$(VERSION) 2>/dev/null || true
	@docker rmi $(REGISTRY)/vscode:$(VERSION) 2>/dev/null || true
	@docker rmi $(REGISTRY)/both:$(VERSION) 2>/dev/null || true
	@echo "Cleanup complete."

clean-volumes: ## Remove all volumes
	@echo "Removing volumes..."
	@$(COMPOSE) down -v
	@echo "Volumes removed."

clean-all: ## Clean everything (containers, images, volumes, networks)
	@echo "Cleaning all DevForge resources..."
	@$(COMPOSE_DEV) down -v --rmi all --remove-orphans || $(COMPOSE) down -v --rmi all --remove-orphans
	@docker volume ls --filter "label=devforge.managed=true" -q | xargs -r docker volume rm || true
	@docker network ls --filter "label=devforge.managed=true" -q | xargs -r docker network rm || true
	@echo "All resources cleaned."

prune: ## Prune Docker system (caution!)
	@echo "Pruning Docker system..."
	@docker system prune -af --volumes
	@echo "System pruned."

# Health and testing
health: ## Check health status of all services
	@echo "Checking service health..."
	@docker ps --filter "label=devforge.managed=true" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

test: ## Run tests (placeholder)
	@echo "Running tests..."
	@echo "TODO: Implement test suite"

# Registry commands
push: ## Push images to registry
	@./build-images.sh --push all

pull: ## Pull images from registry
	@docker pull $(REGISTRY)/claude:$(VERSION)
	@docker pull $(REGISTRY)/vscode:$(VERSION)
	@docker pull $(REGISTRY)/both:$(VERSION)

# Development shortcuts
dev: up-dev ## Alias for up-dev

prod: up ## Alias for up

stop: down ## Alias for down

# Information targets
info: ## Show configuration information
	@echo "DevForge Configuration"
	@echo "============================"
	@echo "Registry:     $(REGISTRY)"
	@echo "Version:      $(VERSION)"
	@echo ""
	@echo "Images:"
	@docker images "$(REGISTRY)/*" --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}" 2>/dev/null || echo "No images found"
	@echo ""
	@echo "Containers:"
	@docker ps -a --filter "label=devforge.managed=true" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo "No containers found"
	@echo ""
	@echo "Volumes:"
	@docker volume ls --filter "label=devforge.managed=true" --format "table {{.Name}}\t{{.Driver}}" 2>/dev/null || echo "No volumes found"
	@echo ""
	@echo "Networks:"
	@docker network ls --filter "label=devforge.managed=true" --format "table {{.Name}}\t{{.Driver}}\t{{.Scope}}" 2>/dev/null || echo "No networks found"

urls: ## Show service URLs
	@echo "Service URLs:"
	@echo "============="
	@echo "Frontend:     http://localhost:3000"
	@echo "Backend:      http://localhost:8000"
	@echo "VS Code:      http://localhost:8080"
	@echo "Redis:        localhost:6379"
	@echo ""
	@echo "API Health:   http://localhost:8000/health"

# Quick commands
quick-start: build up-dev urls ## Build and start everything (development)

quick-clean: clean-all ## Quick full cleanup
