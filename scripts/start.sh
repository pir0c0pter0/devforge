#!/bin/bash
# Script para iniciar os serviços do claude-docker-web
# Usa systemd se os serviços estiverem instalados, senão inicia manualmente

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Cores
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

echo "🚀 Iniciando serviços claude-docker-web..."

# Verificar se serviços systemd existem
if systemctl --user list-unit-files | grep -q "claude-docker-backend.service"; then
    log_info "Usando serviços systemd..."

    # Parar processos manuais se existirem
    pkill -f "node.*dist/index.js" 2>/dev/null || true
    pkill -f "next-server" 2>/dev/null || true

    # Iniciar via systemd
    systemctl --user start claude-docker-backend.service

    # Aguardar backend
    log_info "Aguardando backend..."
    for i in {1..30}; do
        if curl -s http://localhost:8000/health > /dev/null 2>&1; then
            log_success "Backend rodando"
            break
        fi
        if [ $i -eq 30 ]; then
            log_error "Backend não iniciou. Verificando logs..."
            journalctl --user -u claude-docker-backend.service -n 20 --no-pager
            exit 1
        fi
        sleep 1
    done

    systemctl --user start claude-docker-frontend.service

    # Aguardar frontend
    log_info "Aguardando frontend..."
    for i in {1..30}; do
        if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null | grep -q "200"; then
            log_success "Frontend rodando"
            break
        fi
        if [ $i -eq 30 ]; then
            log_error "Frontend não iniciou. Verificando logs..."
            journalctl --user -u claude-docker-frontend.service -n 20 --no-pager
            exit 1
        fi
        sleep 1
    done

else
    log_info "Serviços systemd não encontrados. Iniciando manualmente..."
    log_info "Execute './scripts/install.sh' para instalar os serviços."
    echo ""

    LOG_DIR="/tmp"

    cd "$PROJECT_DIR"

    # Parar serviços existentes primeiro
    "$SCRIPT_DIR/stop.sh" 2>/dev/null || true

    # Verificar acesso ao Docker
    if ! docker ps > /dev/null 2>&1; then
        if sg docker -c "docker ps" > /dev/null 2>&1; then
            USE_SG_DOCKER=true
            log_info "Usando 'sg docker' para acesso ao Docker"
        else
            log_error "Sem acesso ao Docker. Execute: sudo usermod -aG docker \$USER && newgrp docker"
            exit 1
        fi
    else
        USE_SG_DOCKER=false
        log_success "Acesso ao Docker OK"
    fi

    # Carregar variáveis de ambiente
    if [ -f "$PROJECT_DIR/packages/backend/.env" ]; then
        export $(grep -v '^#' "$PROJECT_DIR/packages/backend/.env" | xargs)
    fi

    # Forçar porta 8000 para o backend
    export PORT=8000

    # Iniciar backend
    log_info "Iniciando backend na porta 8000..."
    if [ "$USE_SG_DOCKER" = true ]; then
        sg docker -c "PORT=8000 nohup pnpm --filter backend start > $LOG_DIR/backend.log 2>&1 &"
    else
        PORT=8000 nohup pnpm --filter backend start > "$LOG_DIR/backend.log" 2>&1 &
    fi

    # Aguardar backend
    log_info "Aguardando backend..."
    for i in {1..30}; do
        if curl -s http://localhost:8000/health > /dev/null 2>&1; then
            log_success "Backend rodando"
            break
        fi
        if [ $i -eq 30 ]; then
            log_error "Backend não iniciou. Log:"
            cat "$LOG_DIR/backend.log"
            exit 1
        fi
        sleep 1
    done

    # Iniciar frontend
    log_info "Iniciando frontend na porta 3000..."
    nohup pnpm --filter frontend start > "$LOG_DIR/frontend.log" 2>&1 &

    # Aguardar frontend
    log_info "Aguardando frontend..."
    for i in {1..30}; do
        if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null | grep -q "200"; then
            log_success "Frontend rodando"
            break
        fi
        if [ $i -eq 30 ]; then
            log_error "Frontend não iniciou. Log:"
            cat "$LOG_DIR/frontend.log"
            exit 1
        fi
        sleep 1
    done

    echo ""
    echo "📋 Logs em:"
    echo "   Backend:  $LOG_DIR/backend.log"
    echo "   Frontend: $LOG_DIR/frontend.log"
fi

echo ""
echo "🎉 Serviços iniciados com sucesso!"
echo "   Backend:  http://localhost:8000"
echo "   Frontend: http://localhost:3000"
echo ""
