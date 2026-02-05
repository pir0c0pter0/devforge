#!/bin/bash
# Script para desinstalar os serviços systemd do devforge

set -e

SYSTEMD_USER_DIR="$HOME/.config/systemd/user"

# Cores
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║              DevForge - Desinstalação                      ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Confirmar desinstalação
read -p "Tem certeza que deseja desinstalar os serviços? [s/N] " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Ss]$ ]]; then
    echo "Cancelado."
    exit 0
fi

echo ""

# Parar serviços
log_info "Parando serviços..."
systemctl --user stop devforge-frontend.service 2>/dev/null || true
systemctl --user stop devforge-backend.service 2>/dev/null || true
log_success "Serviços parados"

# Desabilitar serviços
log_info "Desabilitando serviços..."
systemctl --user disable devforge-frontend.service 2>/dev/null || true
systemctl --user disable devforge-backend.service 2>/dev/null || true
log_success "Serviços desabilitados"

# Remover arquivos de serviço
log_info "Removendo arquivos de serviço..."
rm -f "$SYSTEMD_USER_DIR/devforge-backend.service"
rm -f "$SYSTEMD_USER_DIR/devforge-frontend.service"
log_success "Arquivos removidos"

# Recarregar systemd
log_info "Recarregando systemd..."
systemctl --user daemon-reload
log_success "Systemd recarregado"

echo ""
log_success "Desinstalação concluída!"
echo ""
log_warning "Os arquivos do projeto não foram removidos."
log_info "Para remover completamente, delete a pasta do projeto manualmente."
echo ""
log_info "O linger (inicialização sem login) não foi desabilitado."
log_info "Para desabilitar: sudo loginctl disable-linger $(whoami)"
echo ""
