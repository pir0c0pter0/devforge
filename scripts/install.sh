#!/bin/bash
# Script de instalação completa do claude-docker-web
# Instala dependências, configura serviços systemd e habilita inicialização automática

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
USER_NAME="$(whoami)"
SYSTEMD_USER_DIR="$HOME/.config/systemd/user"

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║           Claude Docker Web - Instalação                   ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# ==============================================================================
# 1. Verificar dependências do sistema
# ==============================================================================
log_info "Verificando dependências do sistema..."

MISSING_DEPS=()

# Node.js
if ! command -v node &> /dev/null; then
    MISSING_DEPS+=("node")
else
    NODE_VERSION=$(node -v)
    log_success "Node.js: $NODE_VERSION"
fi

# pnpm
if ! command -v pnpm &> /dev/null; then
    MISSING_DEPS+=("pnpm")
else
    PNPM_VERSION=$(pnpm -v)
    log_success "pnpm: $PNPM_VERSION"
fi

# Docker
if ! command -v docker &> /dev/null; then
    MISSING_DEPS+=("docker")
else
    DOCKER_VERSION=$(docker -v | cut -d' ' -f3 | tr -d ',')
    log_success "Docker: $DOCKER_VERSION"
fi

# Redis/Valkey
REDIS_SERVICE=""
if systemctl list-unit-files | grep -q "^valkey.service"; then
    REDIS_SERVICE="valkey"
    log_success "Valkey (Redis fork) detectado"
elif systemctl list-unit-files | grep -q "^redis.service"; then
    REDIS_SERVICE="redis"
    log_success "Redis detectado"
elif systemctl list-unit-files | grep -q "^redis-server.service"; then
    REDIS_SERVICE="redis-server"
    log_success "Redis Server detectado"
else
    MISSING_DEPS+=("redis/valkey")
fi

if [ ${#MISSING_DEPS[@]} -gt 0 ]; then
    log_error "Dependências faltando: ${MISSING_DEPS[*]}"
    echo ""
    echo "Instale as dependências antes de continuar:"
    echo "  - Node.js: https://nodejs.org/ ou 'paru -S nodejs'"
    echo "  - pnpm: 'npm install -g pnpm' ou 'corepack enable'"
    echo "  - Docker: 'paru -S docker' e 'sudo systemctl enable docker'"
    echo "  - Redis/Valkey: 'paru -S valkey' ou 'paru -S redis'"
    exit 1
fi

# Verificar acesso ao Docker
if ! docker ps &> /dev/null; then
    if sg docker -c "docker ps" &> /dev/null; then
        log_warning "Acesso ao Docker via 'sg docker'. Considere relogar para aplicar grupo."
    else
        log_error "Sem acesso ao Docker. Execute:"
        echo "  sudo usermod -aG docker $USER_NAME"
        echo "  newgrp docker  # ou faça logout/login"
        exit 1
    fi
else
    log_success "Acesso ao Docker OK"
fi

echo ""

# ==============================================================================
# 2. Instalar dependências do projeto
# ==============================================================================
log_info "Instalando dependências do projeto..."
cd "$PROJECT_DIR"
pnpm install
log_success "Dependências instaladas"

echo ""

# ==============================================================================
# 3. Configurar arquivo .env do backend
# ==============================================================================
log_info "Configurando backend..."

BACKEND_ENV="$PROJECT_DIR/packages/backend/.env"

if [ ! -f "$BACKEND_ENV" ]; then
    log_info "Criando arquivo .env do backend..."
    cat > "$BACKEND_ENV" << 'EOF'
# Server Configuration
PORT=8000
HOST=0.0.0.0
NODE_ENV=production

# CORS Configuration
CORS_ORIGIN=*

# Docker Configuration
DOCKER_SOCKET_PATH=/var/run/docker.sock

# Redis Configuration (for BullMQ)
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Logging
LOG_LEVEL=info

# Container Defaults
DEFAULT_CPU_LIMIT=2
DEFAULT_MEMORY_LIMIT=2048
DEFAULT_DISK_LIMIT=10240

# Security
API_KEY=
JWT_SECRET=

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
EOF
    log_success "Arquivo .env criado"
else
    # Corrigir porta se necessário
    if grep -q "^PORT=3000" "$BACKEND_ENV"; then
        sed -i 's/^PORT=3000/PORT=8000/' "$BACKEND_ENV"
        log_success "Porta do backend corrigida para 8000"
    else
        log_success "Arquivo .env já existe"
    fi
fi

echo ""

# ==============================================================================
# 4. Build do projeto
# ==============================================================================
log_info "Compilando projeto..."
pnpm build
log_success "Build concluído"

echo ""

# ==============================================================================
# 5. Criar serviços systemd
# ==============================================================================
log_info "Configurando serviços systemd..."

mkdir -p "$SYSTEMD_USER_DIR"

# Serviço do Backend
cat > "$SYSTEMD_USER_DIR/claude-docker-backend.service" << EOF
[Unit]
Description=Claude Docker Web - Backend
After=network.target

[Service]
Type=simple
WorkingDirectory=$PROJECT_DIR
EnvironmentFile=$PROJECT_DIR/packages/backend/.env
Environment=NODE_ENV=production
Environment=PATH=/usr/bin:/usr/local/bin:$HOME/.local/share/pnpm
ExecStart=/usr/bin/pnpm --filter backend start
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
EOF

log_success "Serviço backend criado"

# Serviço do Frontend
cat > "$SYSTEMD_USER_DIR/claude-docker-frontend.service" << EOF
[Unit]
Description=Claude Docker Web - Frontend
After=network.target claude-docker-backend.service
Wants=claude-docker-backend.service

[Service]
Type=simple
WorkingDirectory=$PROJECT_DIR
Environment=PORT=3000
Environment=NODE_ENV=production
Environment=PATH=/usr/bin:/usr/local/bin:$HOME/.local/share/pnpm
ExecStart=/usr/bin/pnpm --filter frontend start
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
EOF

log_success "Serviço frontend criado"

# Recarregar systemd
systemctl --user daemon-reload
log_success "Systemd recarregado"

echo ""

# ==============================================================================
# 6. Habilitar serviços
# ==============================================================================
log_info "Habilitando serviços para inicialização automática..."

systemctl --user enable claude-docker-backend.service
systemctl --user enable claude-docker-frontend.service

log_success "Serviços habilitados"

echo ""

# ==============================================================================
# 7. Verificar e habilitar Redis/Valkey
# ==============================================================================
log_info "Verificando Redis/Valkey..."

if ! systemctl is-active --quiet "$REDIS_SERVICE"; then
    log_warning "Redis/Valkey não está rodando."
    echo ""
    echo "Execute os seguintes comandos para habilitar:"
    echo -e "  ${YELLOW}sudo systemctl enable $REDIS_SERVICE${NC}"
    echo -e "  ${YELLOW}sudo systemctl start $REDIS_SERVICE${NC}"
    echo ""
    REDIS_NEEDS_SETUP=true
else
    log_success "Redis/Valkey está rodando"
    REDIS_NEEDS_SETUP=false
fi

# ==============================================================================
# 8. Verificar linger (inicialização sem login)
# ==============================================================================
log_info "Verificando configuração de linger..."

if [ -f "/var/lib/systemd/linger/$USER_NAME" ]; then
    log_success "Linger já está habilitado"
    LINGER_NEEDS_SETUP=false
else
    log_warning "Linger não está habilitado."
    echo ""
    echo "Para os serviços iniciarem no boot sem precisar logar, execute:"
    echo -e "  ${YELLOW}sudo loginctl enable-linger $USER_NAME${NC}"
    echo ""
    LINGER_NEEDS_SETUP=true
fi

# ==============================================================================
# 9. Iniciar serviços
# ==============================================================================
echo ""
log_info "Iniciando serviços..."

# Parar serviços antigos se existirem
"$SCRIPT_DIR/stop.sh" 2>/dev/null || true

systemctl --user start claude-docker-backend.service
sleep 3

# Verificar se backend iniciou
if systemctl --user is-active --quiet claude-docker-backend.service; then
    log_success "Backend iniciado"
else
    log_error "Falha ao iniciar backend. Verificando logs..."
    journalctl --user -u claude-docker-backend.service -n 20 --no-pager
    exit 1
fi

systemctl --user start claude-docker-frontend.service
sleep 2

# Verificar se frontend iniciou
if systemctl --user is-active --quiet claude-docker-frontend.service; then
    log_success "Frontend iniciado"
else
    log_error "Falha ao iniciar frontend. Verificando logs..."
    journalctl --user -u claude-docker-frontend.service -n 20 --no-pager
    exit 1
fi

# ==============================================================================
# 10. Resumo final
# ==============================================================================
echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                    Instalação Concluída                    ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "🌐 Acesse: http://localhost:3000"
echo ""
echo "📊 Status dos serviços:"
systemctl --user status claude-docker-backend.service --no-pager -l | head -5
echo ""
systemctl --user status claude-docker-frontend.service --no-pager -l | head -5
echo ""

# Comandos pendentes
if [ "$REDIS_NEEDS_SETUP" = true ] || [ "$LINGER_NEEDS_SETUP" = true ]; then
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║              ⚠️  Ações Manuais Necessárias                  ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo ""
    if [ "$REDIS_NEEDS_SETUP" = true ]; then
        echo "1. Habilitar Redis/Valkey:"
        echo -e "   ${YELLOW}sudo systemctl enable $REDIS_SERVICE${NC}"
        echo -e "   ${YELLOW}sudo systemctl start $REDIS_SERVICE${NC}"
        echo ""
    fi
    if [ "$LINGER_NEEDS_SETUP" = true ]; then
        echo "2. Habilitar linger (boot sem login):"
        echo -e "   ${YELLOW}sudo loginctl enable-linger $USER_NAME${NC}"
        echo ""
    fi
fi

echo "📋 Comandos úteis:"
echo "   ./scripts/status.sh     - Ver status"
echo "   ./scripts/start.sh      - Iniciar serviços"
echo "   ./scripts/stop.sh       - Parar serviços"
echo "   ./scripts/restart.sh    - Reiniciar serviços"
echo "   ./scripts/logs.sh       - Ver logs"
echo "   ./scripts/uninstall.sh  - Desinstalar serviços"
echo ""
