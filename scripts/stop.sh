#!/bin/bash
# Script para parar os serviços do devforge
# Usa systemd se os serviços estiverem instalados, senão para manualmente

set -e

# Cores
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }

echo "🛑 Parando serviços devforge..."

# Verificar se serviços systemd existem e estão rodando
if systemctl --user list-unit-files | grep -q "devforge-backend.service"; then
    log_info "Parando serviços systemd..."

    systemctl --user stop devforge-frontend.service 2>/dev/null || true
    systemctl --user stop devforge-backend.service 2>/dev/null || true

    log_success "Serviços systemd parados"
fi

# Também parar processos manuais se existirem
log_info "Limpando processos residuais..."

# Matar processos do backend
pkill -f "node.*dist/index.js" 2>/dev/null || true
pkill -f "pnpm.*backend" 2>/dev/null || true

# Matar processos do frontend
pkill -f "next-server" 2>/dev/null || true
pkill -f "pnpm.*frontend" 2>/dev/null || true

# Liberar portas se necessário
fuser -k 8000/tcp 2>/dev/null || true
fuser -k 3000/tcp 2>/dev/null || true

sleep 1

log_success "Serviços parados"
