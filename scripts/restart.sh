#!/bin/bash
# Script para reiniciar os serviços do devforge
# Usa systemd se os serviços estiverem instalados

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Cores
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }

echo "🔄 Reiniciando serviços devforge..."

# Verificar se serviços systemd existem
if systemctl --user list-unit-files | grep -q "devforge-backend.service"; then
    log_info "Reiniciando via systemd..."

    systemctl --user restart devforge-backend.service
    sleep 2
    systemctl --user restart devforge-frontend.service
    sleep 2

    log_success "Serviços reiniciados"

    # Mostrar status
    echo ""
    "$SCRIPT_DIR/status.sh"
else
    log_info "Usando scripts manuais..."
    "$SCRIPT_DIR/stop.sh"
    "$SCRIPT_DIR/start.sh"
fi
