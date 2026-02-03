#!/bin/bash
# =============================================================================
# Diagnostics Library - Read-only system checks
# =============================================================================
# This library provides functions to check system requirements without
# making any changes. Each function returns 0 for OK, 1 for WARNING, 2 for ERROR
# =============================================================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Status indicators
OK="${GREEN}[OK]${NC}"
WARN="${YELLOW}[WARN]${NC}"
ERROR="${RED}[ERROR]${NC}"
INFO="${BLUE}[INFO]${NC}"

# =============================================================================
# Docker Daemon Check
# =============================================================================
check_docker_daemon() {
    echo -e "\n${CYAN}${BOLD}=== Docker Daemon ===${NC}"

    # Check if docker is installed
    if ! command -v docker &> /dev/null; then
        echo -e "${ERROR} Docker não está instalado"
        echo -e "${INFO} Para instalar:"
        echo -e "    ${YELLOW}curl -fsSL https://get.docker.com | sh${NC}"
        return 2
    fi
    echo -e "${OK} Docker está instalado: $(docker --version 2>/dev/null | head -1)"

    # Check if docker daemon is running
    if ! docker info &> /dev/null; then
        # Check if it's a permission issue or daemon issue
        if sudo docker info &> /dev/null; then
            echo -e "${WARN} Docker daemon está rodando, mas usuário não tem permissão"
            echo -e "${INFO} Veja a seção 'Docker Group' para resolver"
            return 1
        else
            echo -e "${ERROR} Docker daemon não está rodando"
            echo -e "${INFO} Para iniciar:"
            echo -e "    ${YELLOW}sudo systemctl start docker${NC}"
            echo -e "    ${YELLOW}sudo systemctl enable docker${NC}"
            return 2
        fi
    fi
    echo -e "${OK} Docker daemon está rodando"

    # Check docker socket permissions
    local socket="/var/run/docker.sock"
    if [ -S "$socket" ]; then
        local socket_perms=$(stat -c %a "$socket" 2>/dev/null)
        local socket_group=$(stat -c %G "$socket" 2>/dev/null)
        echo -e "${INFO} Socket: $socket (perms: $socket_perms, group: $socket_group)"
    fi

    return 0
}

# =============================================================================
# Docker Group Check
# =============================================================================
check_docker_group() {
    echo -e "\n${CYAN}${BOLD}=== Docker Group ===${NC}"

    local current_user=$(whoami)

    # Check if docker group exists
    if ! getent group docker &> /dev/null; then
        echo -e "${ERROR} Grupo 'docker' não existe"
        echo -e "${INFO} Para criar:"
        echo -e "    ${YELLOW}sudo groupadd docker${NC}"
        return 2
    fi
    echo -e "${OK} Grupo 'docker' existe"

    # Check if user is in docker group
    if groups "$current_user" | grep -q '\bdocker\b'; then
        echo -e "${OK} Usuário '$current_user' está no grupo docker"

        # Check if the group is active in current session
        if id -nG | grep -q '\bdocker\b'; then
            echo -e "${OK} Grupo docker está ativo na sessão atual"
            return 0
        else
            echo -e "${WARN} Grupo docker não está ativo na sessão atual"
            echo -e "${INFO} Para ativar sem reiniciar:"
            echo -e "    ${YELLOW}newgrp docker${NC}"
            echo -e "${INFO} Ou faça logout e login novamente"
            return 1
        fi
    else
        echo -e "${ERROR} Usuário '$current_user' NÃO está no grupo docker"
        echo -e "${INFO} Para adicionar:"
        echo -e "    ${YELLOW}sudo usermod -aG docker $current_user${NC}"
        echo -e "${INFO} Após adicionar, faça logout e login, ou execute:"
        echo -e "    ${YELLOW}newgrp docker${NC}"
        return 2
    fi
}

# =============================================================================
# Docker Images Check
# =============================================================================
check_docker_images() {
    echo -e "\n${CYAN}${BOLD}=== Docker Images ===${NC}"

    local required_images=("claude-docker/claude:latest" "claude-docker/both:latest")
    local missing_images=()
    local found_images=()

    for image in "${required_images[@]}"; do
        if docker image inspect "$image" &> /dev/null; then
            local size=$(docker image inspect "$image" --format='{{.Size}}' 2>/dev/null)
            local size_mb=$((size / 1024 / 1024))
            echo -e "${OK} Imagem '$image' existe (${size_mb}MB)"
            found_images+=("$image")
        else
            echo -e "${ERROR} Imagem '$image' não encontrada"
            missing_images+=("$image")
        fi
    done

    if [ ${#missing_images[@]} -gt 0 ]; then
        echo -e "${INFO} Para construir as imagens faltando:"
        echo -e "    ${YELLOW}cd $(dirname "$(dirname "$(realpath "$0")")")/docker${NC}"
        for img in "${missing_images[@]}"; do
            local dockerfile=""
            case "$img" in
                *claude*) dockerfile="Dockerfile.claude" ;;
                *both*) dockerfile="Dockerfile.both" ;;
            esac
            if [ -n "$dockerfile" ]; then
                echo -e "    ${YELLOW}docker build -f $dockerfile -t $img .${NC}"
            fi
        done
        return 2
    fi

    return 0
}

# =============================================================================
# Orphan Containers Check
# =============================================================================
check_orphan_containers() {
    echo -e "\n${CYAN}${BOLD}=== Containers Órfãos ===${NC}"

    if ! docker ps &> /dev/null; then
        echo -e "${WARN} Não foi possível verificar containers (permissão negada)"
        return 1
    fi

    # Get all containers with claude-docker prefix
    local all_containers=$(docker ps -a --filter "name=claude-docker-" --format "{{.Names}}" 2>/dev/null)
    local running_containers=$(docker ps --filter "name=claude-docker-" --format "{{.Names}}" 2>/dev/null)

    if [ -z "$all_containers" ]; then
        echo -e "${OK} Nenhum container claude-docker encontrado"
        return 0
    fi

    local total_count=$(echo "$all_containers" | wc -l)
    local running_count=0
    [ -n "$running_containers" ] && running_count=$(echo "$running_containers" | wc -l)
    local stopped_count=$((total_count - running_count))

    echo -e "${INFO} Total de containers: $total_count"
    echo -e "${INFO} Em execução: $running_count"

    if [ $stopped_count -gt 0 ]; then
        echo -e "${WARN} Containers parados: $stopped_count"
        echo -e "${INFO} Para listar containers parados:"
        echo -e "    ${YELLOW}docker ps -a --filter 'name=claude-docker-' --filter 'status=exited'${NC}"
        echo -e "${INFO} Para remover containers parados:"
        echo -e "    ${YELLOW}docker container prune -f --filter 'label=app=claude-docker'${NC}"
        return 1
    fi

    echo -e "${OK} Todos os containers estão em execução"
    return 0
}

# =============================================================================
# Redis Check
# =============================================================================
check_redis() {
    echo -e "\n${CYAN}${BOLD}=== Redis ===${NC}"

    # Check if redis-cli is available
    if ! command -v redis-cli &> /dev/null; then
        echo -e "${WARN} redis-cli não está instalado"
        echo -e "${INFO} Redis é opcional mas recomendado para caching"
        echo -e "${INFO} Para instalar:"
        echo -e "    ${YELLOW}sudo apt install redis-tools${NC}  # Debian/Ubuntu"
        echo -e "    ${YELLOW}sudo pacman -S redis${NC}           # Arch Linux"
        return 1
    fi
    echo -e "${OK} redis-cli está instalado"

    # Check if redis is running
    if redis-cli ping &> /dev/null; then
        local redis_info=$(redis-cli INFO server 2>/dev/null | grep redis_version | cut -d: -f2 | tr -d '\r')
        echo -e "${OK} Redis está rodando (versão: $redis_info)"

        # Check memory usage
        local used_memory=$(redis-cli INFO memory 2>/dev/null | grep used_memory_human | cut -d: -f2 | tr -d '\r')
        echo -e "${INFO} Memória em uso: $used_memory"
        return 0
    else
        # Check if redis-server is installed
        if command -v redis-server &> /dev/null; then
            echo -e "${WARN} Redis está instalado mas não está rodando"
            echo -e "${INFO} Para iniciar:"
            echo -e "    ${YELLOW}sudo systemctl start redis${NC}"
            echo -e "    ${YELLOW}sudo systemctl enable redis${NC}"
        else
            echo -e "${WARN} Redis server não está instalado"
            echo -e "${INFO} Para instalar e iniciar:"
            echo -e "    ${YELLOW}sudo apt install redis-server${NC}  # Debian/Ubuntu"
            echo -e "    ${YELLOW}sudo pacman -S redis${NC}             # Arch Linux"
        fi
        return 1
    fi
}

# =============================================================================
# SSH Keys Check
# =============================================================================
check_ssh_keys() {
    echo -e "\n${CYAN}${BOLD}=== SSH Keys ===${NC}"

    local ssh_dir="$HOME/.ssh"
    local status=0

    # Check if .ssh directory exists
    if [ ! -d "$ssh_dir" ]; then
        echo -e "${ERROR} Diretório ~/.ssh não existe"
        echo -e "${INFO} Para criar:"
        echo -e "    ${YELLOW}mkdir -p ~/.ssh && chmod 700 ~/.ssh${NC}"
        return 2
    fi

    # Check .ssh permissions
    local ssh_perms=$(stat -c %a "$ssh_dir" 2>/dev/null)
    if [ "$ssh_perms" != "700" ]; then
        echo -e "${WARN} Permissões do ~/.ssh incorretas: $ssh_perms (deveria ser 700)"
        echo -e "${INFO} Para corrigir:"
        echo -e "    ${YELLOW}chmod 700 ~/.ssh${NC}"
        status=1
    else
        echo -e "${OK} Permissões do ~/.ssh corretas (700)"
    fi

    # Check for common key files
    local key_types=("id_rsa" "id_ed25519" "id_ecdsa")
    local found_keys=0

    for key in "${key_types[@]}"; do
        if [ -f "$ssh_dir/$key" ]; then
            local key_perms=$(stat -c %a "$ssh_dir/$key" 2>/dev/null)
            if [ "$key_perms" != "600" ]; then
                echo -e "${WARN} Permissões de $key incorretas: $key_perms (deveria ser 600)"
                echo -e "${INFO} Para corrigir:"
                echo -e "    ${YELLOW}chmod 600 ~/.ssh/$key${NC}"
                status=1
            else
                echo -e "${OK} Chave $key encontrada com permissões corretas"
            fi
            found_keys=$((found_keys + 1))
        fi
    done

    if [ $found_keys -eq 0 ]; then
        echo -e "${WARN} Nenhuma chave SSH encontrada"
        echo -e "${INFO} Para gerar uma nova chave ED25519 (recomendado):"
        echo -e "    ${YELLOW}ssh-keygen -t ed25519 -C \"seu-email@exemplo.com\"${NC}"
        echo -e "${INFO} Ou RSA (compatibilidade):"
        echo -e "    ${YELLOW}ssh-keygen -t rsa -b 4096 -C \"seu-email@exemplo.com\"${NC}"
        [ $status -eq 0 ] && status=1
    fi

    # Check for GitHub connectivity
    echo -e "\n${INFO} Testando conexão SSH com GitHub..."
    local ssh_output=$(ssh -T git@github.com 2>&1)
    if echo "$ssh_output" | grep -q "successfully authenticated"; then
        local gh_user=$(echo "$ssh_output" | grep -oP '(?<=Hi )[^!]+')
        echo -e "${OK} Autenticado no GitHub como: $gh_user"
    elif echo "$ssh_output" | grep -q "Permission denied"; then
        echo -e "${WARN} Chave SSH não está configurada no GitHub"
        echo -e "${INFO} Para adicionar sua chave:"
        echo -e "    1. Copie sua chave pública:"
        echo -e "       ${YELLOW}cat ~/.ssh/id_ed25519.pub${NC}"
        echo -e "    2. Adicione em: https://github.com/settings/keys"
        [ $status -eq 0 ] && status=1
    else
        echo -e "${WARN} Não foi possível testar conexão com GitHub"
        [ $status -eq 0 ] && status=1
    fi

    return $status
}

# =============================================================================
# Network/Ports Check
# =============================================================================
check_ports() {
    echo -e "\n${CYAN}${BOLD}=== Portas de Rede ===${NC}"

    local ports=("3000:Frontend" "8000:Backend")
    local status=0

    for port_info in "${ports[@]}"; do
        local port="${port_info%%:*}"
        local service="${port_info##*:}"

        local pid=$(lsof -t -i:$port 2>/dev/null | head -1)
        if [ -n "$pid" ]; then
            local process=$(ps -p $pid -o comm= 2>/dev/null)
            echo -e "${INFO} Porta $port ($service): em uso por $process (PID: $pid)"
        else
            echo -e "${OK} Porta $port ($service): disponível"
        fi
    done

    return $status
}

# =============================================================================
# Disk Space Check
# =============================================================================
check_disk_space() {
    echo -e "\n${CYAN}${BOLD}=== Espaço em Disco ===${NC}"

    # Check Docker disk usage
    if docker system df &> /dev/null; then
        echo -e "${INFO} Uso de disco do Docker:"
        docker system df 2>/dev/null | while read line; do
            echo -e "    $line"
        done
    fi

    # Check root partition
    local root_usage=$(df -h / | awk 'NR==2 {print $5}' | tr -d '%')
    local root_avail=$(df -h / | awk 'NR==2 {print $4}')

    if [ "$root_usage" -gt 90 ]; then
        echo -e "${ERROR} Partição raiz quase cheia: ${root_usage}% usado"
        echo -e "${INFO} Espaço disponível: $root_avail"
        echo -e "${INFO} Para limpar imagens Docker não usadas:"
        echo -e "    ${YELLOW}docker image prune -a${NC}"
        return 2
    elif [ "$root_usage" -gt 80 ]; then
        echo -e "${WARN} Partição raiz com pouco espaço: ${root_usage}% usado"
        echo -e "${INFO} Espaço disponível: $root_avail"
        return 1
    else
        echo -e "${OK} Espaço em disco OK: ${root_usage}% usado ($root_avail disponível)"
        return 0
    fi
}

# =============================================================================
# Summary Function
# =============================================================================
run_all_diagnostics() {
    echo -e "${BOLD}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║        claude-docker-web - Sistema de Diagnósticos         ║${NC}"
    echo -e "${BOLD}╚════════════════════════════════════════════════════════════╝${NC}"
    echo -e "${INFO} Data: $(date '+%Y-%m-%d %H:%M:%S')"
    echo -e "${INFO} Usuário: $(whoami)"
    echo -e "${INFO} Sistema: $(uname -s) $(uname -r)"

    local total_errors=0
    local total_warnings=0

    # Run all checks
    check_docker_daemon
    case $? in
        2) total_errors=$((total_errors + 1)) ;;
        1) total_warnings=$((total_warnings + 1)) ;;
    esac

    check_docker_group
    case $? in
        2) total_errors=$((total_errors + 1)) ;;
        1) total_warnings=$((total_warnings + 1)) ;;
    esac

    check_docker_images
    case $? in
        2) total_errors=$((total_errors + 1)) ;;
        1) total_warnings=$((total_warnings + 1)) ;;
    esac

    check_orphan_containers
    case $? in
        2) total_errors=$((total_errors + 1)) ;;
        1) total_warnings=$((total_warnings + 1)) ;;
    esac

    check_redis
    case $? in
        2) total_errors=$((total_errors + 1)) ;;
        1) total_warnings=$((total_warnings + 1)) ;;
    esac

    check_ssh_keys
    case $? in
        2) total_errors=$((total_errors + 1)) ;;
        1) total_warnings=$((total_warnings + 1)) ;;
    esac

    check_ports
    case $? in
        2) total_errors=$((total_errors + 1)) ;;
        1) total_warnings=$((total_warnings + 1)) ;;
    esac

    check_disk_space
    case $? in
        2) total_errors=$((total_errors + 1)) ;;
        1) total_warnings=$((total_warnings + 1)) ;;
    esac

    # Summary
    echo -e "\n${BOLD}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║                        RESUMO                              ║${NC}"
    echo -e "${BOLD}╚════════════════════════════════════════════════════════════╝${NC}"

    if [ $total_errors -gt 0 ]; then
        echo -e "${ERROR} Erros encontrados: $total_errors"
    fi
    if [ $total_warnings -gt 0 ]; then
        echo -e "${WARN} Avisos encontrados: $total_warnings"
    fi
    if [ $total_errors -eq 0 ] && [ $total_warnings -eq 0 ]; then
        echo -e "${OK} Todos os sistemas estão funcionando corretamente!"
    fi

    echo ""

    # Return appropriate exit code
    if [ $total_errors -gt 0 ]; then
        return 2
    elif [ $total_warnings -gt 0 ]; then
        return 1
    fi
    return 0
}
