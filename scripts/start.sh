#!/bin/bash
# Script para iniciar todos os serviços do claude-docker-web

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="/tmp"

cd "$PROJECT_DIR"

echo "🚀 Iniciando serviços claude-docker-web..."

# Parar serviços existentes primeiro
"$SCRIPT_DIR/stop.sh" 2>/dev/null || true

# Verificar se usuário tem acesso ao Docker
if ! docker ps > /dev/null 2>&1; then
    # Tentar com sg docker
    if sg docker -c "docker ps" > /dev/null 2>&1; then
        USE_SG_DOCKER=true
        echo "📦 Usando 'sg docker' para acesso ao Docker"
    else
        echo "❌ Sem acesso ao Docker. Execute: sudo usermod -aG docker \$USER && newgrp docker"
        exit 1
    fi
else
    USE_SG_DOCKER=false
    echo "📦 Acesso ao Docker OK"
fi

# Carregar variáveis de ambiente do backend
if [ -f "$PROJECT_DIR/packages/backend/.env" ]; then
    export $(grep -v '^#' "$PROJECT_DIR/packages/backend/.env" | xargs)
fi

# Iniciar backend
echo "🔧 Iniciando backend na porta 8000..."
if [ "$USE_SG_DOCKER" = true ]; then
    sg docker -c "PORT=8000 nohup pnpm --filter backend start > $LOG_DIR/backend.log 2>&1 &"
else
    PORT=8000 nohup pnpm --filter backend start > "$LOG_DIR/backend.log" 2>&1 &
fi

# Aguardar backend
echo "⏳ Aguardando backend..."
for i in {1..30}; do
    if curl -s http://localhost:8000/health > /dev/null 2>&1; then
        echo "✅ Backend rodando"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "❌ Backend não iniciou. Log:"
        cat "$LOG_DIR/backend.log"
        exit 1
    fi
    sleep 1
done

# Iniciar frontend
echo "🌐 Iniciando frontend na porta 3000..."
nohup pnpm --filter frontend start > "$LOG_DIR/frontend.log" 2>&1 &

# Aguardar frontend
echo "⏳ Aguardando frontend..."
for i in {1..30}; do
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null | grep -q "200"; then
        echo "✅ Frontend rodando"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "❌ Frontend não iniciou. Log:"
        cat "$LOG_DIR/frontend.log"
        exit 1
    fi
    sleep 1
done

echo ""
echo "🎉 Serviços iniciados com sucesso!"
echo "   Backend:  http://localhost:8000"
echo "   Frontend: http://localhost:3000"
echo ""
echo "📋 Logs em:"
echo "   Backend:  $LOG_DIR/backend.log"
echo "   Frontend: $LOG_DIR/frontend.log"
