#!/bin/bash
# Script para reiniciar todos os serviços do claude-docker-web

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🔄 Reiniciando serviços..."
"$SCRIPT_DIR/stop.sh"
"$SCRIPT_DIR/start.sh"
