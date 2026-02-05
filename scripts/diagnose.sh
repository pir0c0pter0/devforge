#!/bin/bash
# =============================================================================
# DevForge - Sistema de Diagnósticos
# =============================================================================
# Script principal para diagnóstico do sistema
# Uso: ./diagnose.sh [--check <componente>] [--json]
#
# Componentes disponíveis:
#   docker    - Docker daemon e permissões
#   group     - Grupo docker
#   images    - Imagens Docker
#   containers- Containers órfãos
#   redis     - Redis server
#   ssh       - Chaves SSH
#   ports     - Portas de rede
#   disk      - Espaço em disco
#   all       - Todos os componentes (padrão)
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source the diagnostics library
source "$SCRIPT_DIR/lib/diagnostics.sh"

# Parse arguments
CHECK_COMPONENT="all"
JSON_OUTPUT=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --check|-c)
            CHECK_COMPONENT="$2"
            shift 2
            ;;
        --json|-j)
            JSON_OUTPUT=true
            shift
            ;;
        --help|-h)
            echo "Uso: $0 [--check <componente>] [--json]"
            echo ""
            echo "Componentes disponíveis:"
            echo "  docker     - Docker daemon e permissões"
            echo "  group      - Grupo docker"
            echo "  images     - Imagens Docker"
            echo "  containers - Containers órfãos"
            echo "  redis      - Redis server"
            echo "  ssh        - Chaves SSH"
            echo "  ports      - Portas de rede"
            echo "  disk       - Espaço em disco"
            echo "  all        - Todos os componentes (padrão)"
            echo ""
            echo "Opções:"
            echo "  --check, -c  Verificar componente específico"
            echo "  --json, -j   Saída em formato JSON (não implementado)"
            echo "  --help, -h   Mostrar esta ajuda"
            exit 0
            ;;
        *)
            echo "Opção desconhecida: $1"
            echo "Use --help para ver as opções disponíveis"
            exit 1
            ;;
    esac
done

# Run diagnostics based on component
case "$CHECK_COMPONENT" in
    docker)
        check_docker_daemon
        ;;
    group)
        check_docker_group
        ;;
    images)
        check_docker_images
        ;;
    containers)
        check_orphan_containers
        ;;
    redis)
        check_redis
        ;;
    ssh)
        check_ssh_keys
        ;;
    ports)
        check_ports
        ;;
    disk)
        check_disk_space
        ;;
    all)
        run_all_diagnostics
        ;;
    *)
        echo "Componente desconhecido: $CHECK_COMPONENT"
        echo "Use --help para ver os componentes disponíveis"
        exit 1
        ;;
esac

exit $?
