#!/bin/bash
# Script para verificar status dos serviços claude-docker-web

# Cores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "📊 Status dos serviços claude-docker-web"
echo ""

# Verificar se usa systemd
USES_SYSTEMD=false
if systemctl --user list-unit-files | grep -q "claude-docker-backend.service"; then
    USES_SYSTEMD=true
fi

# Backend
echo -n "Backend (8000):  "
if curl -s http://localhost:8000/health > /dev/null 2>&1; then
    health=$(curl -s http://localhost:8000/health)
    echo -e "${GREEN}✅ Rodando${NC} - $health"
else
    echo -e "${RED}❌ Parado${NC}"
fi

# Frontend
echo -n "Frontend (3000): "
status=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null)
if [ "$status" = "200" ]; then
    echo -e "${GREEN}✅ Rodando${NC}"
else
    echo -e "${RED}❌ Parado${NC} (HTTP $status)"
fi

# Docker
echo -n "Docker:          "
if docker ps > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Acessível${NC}"
elif sg docker -c "docker ps" > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Acessível via 'sg docker'${NC}"
else
    echo -e "${RED}❌ Sem acesso${NC}"
fi

# Redis/Valkey
echo -n "Redis/Valkey:    "
if redis-cli ping 2>/dev/null | grep -q "PONG"; then
    echo -e "${GREEN}✅ Rodando${NC}"
else
    echo -e "${RED}❌ Parado${NC}"
fi

echo ""

# Mostrar status dos serviços systemd se instalados
if [ "$USES_SYSTEMD" = true ]; then
    echo "🔧 Serviços Systemd:"
    echo ""

    # Backend service
    echo -n "  claude-docker-backend:  "
    if systemctl --user is-active --quiet claude-docker-backend.service; then
        echo -e "${GREEN}● active${NC}"
    else
        status=$(systemctl --user is-active claude-docker-backend.service 2>/dev/null || echo "inactive")
        echo -e "${RED}○ $status${NC}"
    fi

    # Frontend service
    echo -n "  claude-docker-frontend: "
    if systemctl --user is-active --quiet claude-docker-frontend.service; then
        echo -e "${GREEN}● active${NC}"
    else
        status=$(systemctl --user is-active claude-docker-frontend.service 2>/dev/null || echo "inactive")
        echo -e "${RED}○ $status${NC}"
    fi

    # Auto-start enabled?
    echo ""
    echo -n "  Auto-start habilitado:  "
    if systemctl --user is-enabled --quiet claude-docker-backend.service 2>/dev/null; then
        echo -e "${GREEN}✅ Sim${NC}"
    else
        echo -e "${YELLOW}⚠️  Não${NC}"
    fi

    # Linger enabled?
    echo -n "  Boot sem login:         "
    if [ -f "/var/lib/systemd/linger/$(whoami)" ]; then
        echo -e "${GREEN}✅ Habilitado${NC}"
    else
        echo -e "${YELLOW}⚠️  Não habilitado${NC} (execute: sudo loginctl enable-linger $(whoami))"
    fi

    echo ""
else
    echo -e "${BLUE}ℹ️  Serviços systemd não instalados.${NC}"
    echo "   Execute './scripts/install.sh' para instalar."
    echo ""
fi
