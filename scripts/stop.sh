#!/bin/bash
# Script para parar todos os serviços do claude-docker-web

set -e

echo "🛑 Parando serviços..."

# Matar processos do backend
pkill -f "node.*dist/index.js" 2>/dev/null || true
pkill -f "pnpm.*backend" 2>/dev/null || true

# Matar processos do frontend
pkill -f "next-server" 2>/dev/null || true
pkill -f "pnpm.*frontend" 2>/dev/null || true

# Liberar portas
fuser -k 8000/tcp 2>/dev/null || true
fuser -k 3000/tcp 2>/dev/null || true

sleep 2

echo "✅ Serviços parados"
