#!/bin/bash
#
# Claude Docker Web - Gerenciador de Containers com Claude Code + VS Code
#
set -e

VERSION="1.1.0"
INSTALL_DIR="$HOME/.local/share/claude-docker-web"
CONFIG_DIR="$HOME/.config/claude-docker-web"
BIN_DIR="$HOME/.local/bin"

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# Logging
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "${CYAN}>>>${NC} ${BOLD}$1${NC}"; }

# Banner
show_banner() {
    echo -e "${CYAN}"
    cat << 'EOF'
   _____ _                 _        _____             _
  / ____| |               | |      |  __ \           | |
 | |    | | __ _ _   _  __| | ___  | |  | | ___   ___| | _____ _ __
 | |    | |/ _` | | | |/ _` |/ _ \ | |  | |/ _ \ / __| |/ / _ \ '__|
 | |____| | (_| | |_| | (_| |  __/ | |__| | (_) | (__|   <  __/ |
  \_____|_|\__,_|\__,_|\__,_|\___| |_____/ \___/ \___|_|\_\___|_|
                                                            Web v1.1
EOF
    echo -e "${NC}"
}

# Verificar se comando existe
check_cmd() {
    command -v "$1" &>/dev/null
}

# Verificar se grupo docker está ativo na sessão atual
check_docker_group_active() {
    id -nG | grep -qw docker
}

# Executar comando com grupo docker se necessário
run_with_docker_group() {
    if check_docker_group_active; then
        "$@"
    else
        sg docker -c "$*"
    fi
}

# ============================================
# COMANDO: init
# Configuração inicial interativa
# ============================================
cmd_init() {
    show_banner
    echo -e "${BOLD}Assistente de Configuração Inicial${NC}"
    echo ""

    local all_ok=true
    local needs_relogin=false

    # ========== 1. Verificar dependências ==========
    log_step "Verificando dependências..."
    echo ""

    # Node.js
    if check_cmd node; then
        local node_ver=$(node --version)
        log_success "Node.js: $node_ver"
    else
        log_error "Node.js não encontrado"
        echo "  Instale com: sudo pacman -S nodejs"
        all_ok=false
    fi

    # pnpm
    if check_cmd pnpm; then
        local pnpm_ver=$(pnpm --version)
        log_success "pnpm: $pnpm_ver"
    else
        log_warn "pnpm não encontrado"
        echo ""
        read -p "  Deseja instalar o pnpm agora? (Y/n) " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Nn]$ ]]; then
            npm install -g pnpm
            log_success "pnpm instalado"
        else
            all_ok=false
        fi
    fi

    # Docker
    if check_cmd docker; then
        log_success "Docker instalado"
    else
        log_error "Docker não encontrado"
        echo "  Instale com: sudo pacman -S docker"
        all_ok=false
    fi

    # Redis (opcional)
    if check_cmd redis-server; then
        log_success "Redis instalado"
    else
        log_info "Redis não encontrado (opcional)"
    fi

    echo ""

    # ========== 2. Verificar grupo Docker ==========
    log_step "Verificando permissões do Docker..."
    echo ""

    # Primeiro verifica se está no grupo
    if groups "$USER" | grep -qw docker; then
        log_success "Usuário está no grupo 'docker'"

        # Verifica se o grupo está ativo na sessão atual
        if check_docker_group_active; then
            log_success "Grupo 'docker' ativo na sessão atual"
        else
            log_warn "Grupo 'docker' NÃO está ativo nesta sessão"
            log_info "O sistema usará 'sg docker' automaticamente"
            log_info "Para ativar permanentemente, faça logout/login ou execute: newgrp docker"
        fi
    else
        log_warn "Usuário NÃO está no grupo 'docker'"
        echo ""
        read -p "  Deseja adicionar ao grupo docker agora? (requer sudo) (Y/n) " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Nn]$ ]]; then
            sudo usermod -aG docker "$USER"
            log_success "Adicionado ao grupo 'docker'"
            log_warn "IMPORTANTE: Você precisa fazer logout/login para aplicar"
            needs_relogin=true
        else
            log_warn "Sem permissão do Docker, o sistema não funcionará corretamente"
            all_ok=false
        fi
    fi

    echo ""

    # ========== 3. Verificar Docker daemon ==========
    log_step "Verificando Docker daemon..."
    echo ""

    # Tenta com sg docker se necessário
    if run_with_docker_group docker info &>/dev/null 2>&1; then
        log_success "Docker daemon está rodando e acessível"
    else
        # Verifica se está rodando mas sem acesso
        if systemctl is-active --quiet docker 2>/dev/null; then
            log_warn "Docker daemon está rodando mas sem acesso"
            log_info "Verifique as permissões do grupo docker"
            if [ "$needs_relogin" = false ]; then
                all_ok=false
            fi
        else
            log_warn "Docker daemon não está rodando"
            echo ""
            read -p "  Deseja iniciar o Docker agora? (requer sudo) (Y/n) " -n 1 -r
            echo ""
            if [[ ! $REPLY =~ ^[Nn]$ ]]; then
                sudo systemctl start docker
                sudo systemctl enable docker
                log_success "Docker iniciado e habilitado no boot"
            else
                all_ok=false
            fi
        fi
    fi

    echo ""

    # ========== 4. Verificar autenticação Claude ==========
    log_step "Verificando autenticação do Claude Code..."
    echo ""

    if [ -f "$HOME/.claude/.credentials.json" ]; then
        log_success "Credenciais do Claude encontradas"
        log_info "Autenticação via browser será compartilhada com containers"
    else
        log_warn "Credenciais do Claude NÃO encontradas"
        echo ""
        echo "  O Claude Code usa autenticação via navegador (conta Personal/Max/Pro)."
        echo ""
        read -p "  Deseja fazer login no Claude agora? (Y/n) " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Nn]$ ]]; then
            if check_cmd claude; then
                echo ""
                log_info "Abrindo Claude Code para autenticação..."
                log_info "Siga as instruções no navegador e depois pressione Ctrl+C"
                echo ""
                timeout 120 claude 2>/dev/null || true

                if [ -f "$HOME/.claude/.credentials.json" ]; then
                    log_success "Autenticação concluída!"
                else
                    log_warn "Autenticação não detectada. Execute 'claude' manualmente depois."
                fi
            else
                log_info "Claude Code não encontrado globalmente."
                log_info "Será instalado nos containers automaticamente."
            fi
        fi
    fi

    echo ""

    # ========== 5. Verificar SSH ==========
    log_step "Verificando configuração SSH (para Git)..."
    echo ""

    if [ -d "$HOME/.ssh" ] && [ -f "$HOME/.ssh/id_rsa" -o -f "$HOME/.ssh/id_ed25519" ]; then
        log_success "Chaves SSH encontradas"
        log_info "Serão compartilhadas com containers para git clone"
    else
        log_warn "Chaves SSH não encontradas"
        echo ""
        read -p "  Deseja gerar uma chave SSH agora? (Y/n) " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Nn]$ ]]; then
            echo ""
            read -p "  Seu email (para a chave): " email
            mkdir -p "$HOME/.ssh"
            chmod 700 "$HOME/.ssh"
            ssh-keygen -t ed25519 -C "$email" -f "$HOME/.ssh/id_ed25519" -N ""
            log_success "Chave SSH gerada em ~/.ssh/id_ed25519"
            echo ""
            log_info "Adicione a chave pública ao GitHub:"
            echo ""
            cat "$HOME/.ssh/id_ed25519.pub"
            echo ""
            echo "  GitHub > Settings > SSH and GPG keys > New SSH key"
            echo ""
            read -p "  Pressione Enter quando terminar..."
        fi
    fi

    echo ""

    # ========== 6. Construir imagens Docker ==========
    log_step "Verificando imagens Docker..."
    echo ""

    local has_images=false
    if run_with_docker_group docker images 2>/dev/null | grep -q "claude-docker"; then
        has_images=true
        log_success "Imagens claude-docker encontradas"
        run_with_docker_group docker images --format "  {{.Repository}}:{{.Tag}}\t{{.Size}}" 2>/dev/null | grep "claude-docker" || true
    fi

    if [ "$has_images" = false ]; then
        log_warn "Imagens Docker não encontradas"
        echo ""
        read -p "  Deseja construir as imagens agora? (pode demorar ~5min) (Y/n) " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Nn]$ ]]; then
            if [ -d "$INSTALL_DIR/docker/base-image" ]; then
                log_info "Construindo imagens..."
                cd "$INSTALL_DIR/docker/base-image"

                # Build imagem Claude (principal)
                if [ -f "Dockerfile.claude" ]; then
                    echo ""
                    log_info "Construindo claude-docker/claude..."
                    run_with_docker_group docker build -t claude-docker/claude:latest -f Dockerfile.claude . 2>&1 | tail -3
                    log_success "Imagem claude-docker/claude construída"
                fi

                # Build imagem VS Code
                if [ -f "Dockerfile.vscode" ]; then
                    echo ""
                    log_info "Construindo claude-docker/vscode..."
                    run_with_docker_group docker build -t claude-docker/vscode:latest -f Dockerfile.vscode . 2>&1 | tail -3
                    log_success "Imagem claude-docker/vscode construída"
                fi

                # Build imagem completa (both)
                if [ -f "Dockerfile.both" ]; then
                    echo ""
                    log_info "Construindo claude-docker/both..."
                    run_with_docker_group docker build -t claude-docker/both:latest -f Dockerfile.both . 2>&1 | tail -3
                    log_success "Imagem claude-docker/both construída"
                fi
            else
                log_error "Diretório de imagens não encontrado: $INSTALL_DIR/docker/base-image"
            fi
        fi
    fi

    echo ""

    # ========== 7. Verificar PATH ==========
    log_step "Verificando PATH..."
    echo ""

    if [[ ":$PATH:" == *":$BIN_DIR:"* ]]; then
        log_success "PATH configurado corretamente"
    else
        log_warn "~/.local/bin não está no PATH"

        local shell_rc=""
        if [ -f "$HOME/.zshrc" ]; then
            shell_rc="$HOME/.zshrc"
        elif [ -f "$HOME/.bashrc" ]; then
            shell_rc="$HOME/.bashrc"
        fi

        if [ -n "$shell_rc" ]; then
            echo ""
            read -p "  Deseja adicionar ao $shell_rc automaticamente? (Y/n) " -n 1 -r
            echo ""
            if [[ ! $REPLY =~ ^[Nn]$ ]]; then
                echo '' >> "$shell_rc"
                echo '# Claude Docker Web' >> "$shell_rc"
                echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$shell_rc"
                log_success "PATH adicionado ao $shell_rc"
                log_warn "Execute: source $shell_rc"
            fi
        fi
    fi

    echo ""

    # ========== 8. Resumo ==========
    echo ""
    echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}                    RESUMO DA CONFIGURAÇÃO${NC}"
    echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
    echo ""

    # Status de cada item
    printf "  %-30s" "Node.js:"
    check_cmd node && echo -e "${GREEN}OK${NC}" || echo -e "${RED}FALTANDO${NC}"

    printf "  %-30s" "pnpm:"
    check_cmd pnpm && echo -e "${GREEN}OK${NC}" || echo -e "${RED}FALTANDO${NC}"

    printf "  %-30s" "Docker:"
    check_cmd docker && echo -e "${GREEN}OK${NC}" || echo -e "${RED}FALTANDO${NC}"

    printf "  %-30s" "Docker daemon:"
    run_with_docker_group docker info &>/dev/null 2>&1 && echo -e "${GREEN}RODANDO${NC}" || echo -e "${RED}INACESSÍVEL${NC}"

    printf "  %-30s" "Grupo docker:"
    if groups "$USER" | grep -qw docker; then
        if check_docker_group_active; then
            echo -e "${GREEN}OK (ativo)${NC}"
        else
            echo -e "${YELLOW}OK (requer sg docker)${NC}"
        fi
    else
        echo -e "${RED}NÃO CONFIGURADO${NC}"
    fi

    printf "  %-30s" "Claude autenticado:"
    [ -f "$HOME/.claude/.credentials.json" ] && echo -e "${GREEN}OK${NC}" || echo -e "${YELLOW}PENDENTE${NC}"

    printf "  %-30s" "SSH keys:"
    [ -f "$HOME/.ssh/id_rsa" -o -f "$HOME/.ssh/id_ed25519" ] && echo -e "${GREEN}OK${NC}" || echo -e "${YELLOW}OPCIONAL${NC}"

    printf "  %-30s" "Imagens Docker:"
    run_with_docker_group docker images 2>/dev/null | grep -q "claude-docker" && echo -e "${GREEN}OK${NC}" || echo -e "${YELLOW}NÃO CONSTRUÍDAS${NC}"

    echo ""
    echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
    echo ""

    if [ "$needs_relogin" = true ]; then
        echo -e "${YELLOW}${BOLD}AÇÃO NECESSÁRIA:${NC}"
        echo ""
        echo "  Você foi adicionado ao grupo 'docker'."
        echo "  Faça logout/login ou execute:"
        echo ""
        echo -e "    ${CYAN}newgrp docker${NC}"
        echo ""
        echo "  Depois execute novamente:"
        echo ""
        echo -e "    ${CYAN}claude-docker-web init${NC}"
        echo ""
    elif [ "$all_ok" = true ]; then
        echo -e "${GREEN}${BOLD}CONFIGURAÇÃO COMPLETA!${NC}"
        echo ""
        echo "  Para iniciar o dashboard:"
        echo ""
        echo -e "    ${CYAN}claude-docker-web start${NC}"
        echo ""
        echo "  Depois acesse: ${BLUE}http://localhost:3000${NC}"
        echo ""
    else
        echo -e "${YELLOW}${BOLD}CONFIGURAÇÃO INCOMPLETA${NC}"
        echo ""
        echo "  Resolva os itens pendentes e execute novamente:"
        echo ""
        echo -e "    ${CYAN}claude-docker-web init${NC}"
        echo ""
    fi
}

# ============================================
# COMANDO: start
# ============================================
cmd_start() {
    echo -e "${CYAN}Iniciando Claude Docker Web...${NC}"
    echo ""

    # Verificar pré-requisitos
    if ! run_with_docker_group docker info &>/dev/null 2>&1; then
        log_error "Docker daemon não está acessível"
        echo ""
        log_info "Possíveis soluções:"
        echo "  1. Iniciar Docker: sudo systemctl start docker"
        echo "  2. Adicionar ao grupo: sudo usermod -aG docker \$USER"
        echo "  3. Ativar grupo: newgrp docker"
        echo "  4. Executar diagnóstico: claude-docker-web init"
        exit 1
    fi

    # Iniciar Redis se disponível e não estiver rodando
    if check_cmd redis-server; then
        if ! pgrep -x redis-server > /dev/null; then
            log_info "Iniciando Redis..."
            redis-server --daemonize yes 2>/dev/null || true
        fi
    fi

    # Criar diretórios de config
    mkdir -p "$CONFIG_DIR"

    # Copiar config se existir
    if [ -f "$CONFIG_DIR/config.env" ]; then
        cp "$CONFIG_DIR/config.env" "$INSTALL_DIR/packages/backend/.env" 2>/dev/null || true
    fi

    # Matar processos antigos se existirem
    if [ -f "$CONFIG_DIR/backend.pid" ]; then
        local old_pid=$(cat "$CONFIG_DIR/backend.pid")
        if kill -0 "$old_pid" 2>/dev/null; then
            log_warn "Backend já rodando (PID: $old_pid), reiniciando..."
            kill "$old_pid" 2>/dev/null || true
            sleep 1
        fi
        rm -f "$CONFIG_DIR/backend.pid"
    fi

    if [ -f "$CONFIG_DIR/frontend.pid" ]; then
        local old_pid=$(cat "$CONFIG_DIR/frontend.pid")
        if kill -0 "$old_pid" 2>/dev/null; then
            log_warn "Frontend já rodando (PID: $old_pid), reiniciando..."
            kill "$old_pid" 2>/dev/null || true
            sleep 1
        fi
        rm -f "$CONFIG_DIR/frontend.pid"
    fi

    # Liberar portas se necessário
    fuser -k 8000/tcp 2>/dev/null || true
    fuser -k 3000/tcp 2>/dev/null || true
    sleep 1

    # Iniciar backend com grupo docker e auth desabilitado
    log_info "Iniciando backend..."
    cd "$INSTALL_DIR/packages/backend"

    if check_docker_group_active; then
        PORT=8000 ENABLE_AUTH=false node dist/index.js > "$CONFIG_DIR/backend.log" 2>&1 &
        BACKEND_PID=$!
    else
        # Usa sg docker para executar com permissão do grupo
        sg docker -c "cd '$INSTALL_DIR/packages/backend' && PORT=8000 ENABLE_AUTH=false node dist/index.js" > "$CONFIG_DIR/backend.log" 2>&1 &
        BACKEND_PID=$!
    fi

    echo "$BACKEND_PID" > "$CONFIG_DIR/backend.pid"

    # Aguardar backend iniciar
    sleep 2

    # Verificar se backend iniciou
    if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
        log_error "Backend falhou ao iniciar. Verifique os logs:"
        echo ""
        tail -20 "$CONFIG_DIR/backend.log" 2>/dev/null || true
        exit 1
    fi

    # Verificar se API está respondendo
    local retries=5
    while [ $retries -gt 0 ]; do
        if curl -s http://localhost:8000/api/containers &>/dev/null; then
            log_success "Backend iniciado (PID: $BACKEND_PID)"
            break
        fi
        sleep 1
        retries=$((retries - 1))
    done

    if [ $retries -eq 0 ]; then
        log_warn "Backend iniciou mas API não respondeu ainda"
    fi

    # Iniciar frontend
    log_info "Iniciando frontend..."
    cd "$INSTALL_DIR/packages/frontend"
    PORT=3000 npx next start > "$CONFIG_DIR/frontend.log" 2>&1 &
    FRONTEND_PID=$!
    echo "$FRONTEND_PID" > "$CONFIG_DIR/frontend.pid"

    sleep 2

    if kill -0 "$FRONTEND_PID" 2>/dev/null; then
        log_success "Frontend iniciado (PID: $FRONTEND_PID)"
    else
        log_error "Frontend falhou ao iniciar. Verifique os logs:"
        tail -20 "$CONFIG_DIR/frontend.log" 2>/dev/null || true
        exit 1
    fi

    echo ""
    echo -e "${GREEN}════════════════════════════════════════${NC}"
    echo -e "${GREEN}       Claude Docker Web Iniciado!${NC}"
    echo -e "${GREEN}════════════════════════════════════════${NC}"
    echo ""
    echo -e "  Dashboard: ${BLUE}http://localhost:3000${NC}"
    echo -e "  API:       ${DIM}http://localhost:8000${NC}"
    echo ""
    echo -e "  Parar:     ${CYAN}claude-docker-web stop${NC}"
    echo -e "  Status:    ${CYAN}claude-docker-web status${NC}"
    echo -e "  Logs:      ${CYAN}claude-docker-web logs${NC}"
    echo ""
}

# ============================================
# COMANDO: stop
# ============================================
cmd_stop() {
    echo -e "${CYAN}Parando Claude Docker Web...${NC}"

    local stopped=false

    if [ -f "$CONFIG_DIR/backend.pid" ]; then
        local pid=$(cat "$CONFIG_DIR/backend.pid")
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null || true
            log_success "Backend parado (PID: $pid)"
            stopped=true
        fi
        rm -f "$CONFIG_DIR/backend.pid"
    fi

    if [ -f "$CONFIG_DIR/frontend.pid" ]; then
        local pid=$(cat "$CONFIG_DIR/frontend.pid")
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null || true
            log_success "Frontend parado (PID: $pid)"
            stopped=true
        fi
        rm -f "$CONFIG_DIR/frontend.pid"
    fi

    # Matar processos órfãos relacionados
    pkill -f "node.*dist/index.js" 2>/dev/null || true
    pkill -f "next-server" 2>/dev/null || true
    pkill -f "sg docker.*node" 2>/dev/null || true

    # Liberar portas
    fuser -k 8000/tcp 2>/dev/null || true
    fuser -k 3000/tcp 2>/dev/null || true

    echo ""
    if [ "$stopped" = true ]; then
        log_success "Claude Docker Web parado"
    else
        log_info "Nenhum serviço estava rodando"
    fi
}

# ============================================
# COMANDO: restart
# ============================================
cmd_restart() {
    cmd_stop
    sleep 1
    cmd_start
}

# ============================================
# COMANDO: status
# ============================================
cmd_status() {
    echo ""
    echo -e "${BOLD}Claude Docker Web - Status${NC}"
    echo ""

    # Backend
    printf "  %-15s" "Backend:"
    if [ -f "$CONFIG_DIR/backend.pid" ] && kill -0 $(cat "$CONFIG_DIR/backend.pid") 2>/dev/null; then
        local pid=$(cat "$CONFIG_DIR/backend.pid")
        if curl -s http://localhost:8000/api/containers &>/dev/null; then
            echo -e "${GREEN}RODANDO${NC} (PID: $pid, API OK)"
        else
            echo -e "${YELLOW}RODANDO${NC} (PID: $pid, API não responde)"
        fi
    else
        echo -e "${RED}PARADO${NC}"
    fi

    # Frontend
    printf "  %-15s" "Frontend:"
    if [ -f "$CONFIG_DIR/frontend.pid" ] && kill -0 $(cat "$CONFIG_DIR/frontend.pid") 2>/dev/null; then
        local pid=$(cat "$CONFIG_DIR/frontend.pid")
        if curl -sI http://localhost:3000 2>/dev/null | grep -q "200"; then
            echo -e "${GREEN}RODANDO${NC} (PID: $pid, HTTP OK)"
        else
            echo -e "${YELLOW}RODANDO${NC} (PID: $pid)"
        fi
    else
        echo -e "${RED}PARADO${NC}"
    fi

    # Docker
    printf "  %-15s" "Docker:"
    if run_with_docker_group docker info &>/dev/null 2>&1; then
        echo -e "${GREEN}RODANDO${NC}"
    else
        echo -e "${RED}INACESSÍVEL${NC}"
    fi

    # Redis
    printf "  %-15s" "Redis:"
    if pgrep -x redis-server > /dev/null; then
        echo -e "${GREEN}RODANDO${NC}"
    else
        echo -e "${YELLOW}PARADO${NC} (opcional)"
    fi

    # Containers ativos
    echo ""
    printf "  %-15s" "Containers:"
    local count=$(run_with_docker_group docker ps --filter "name=claude-docker" --format "{{.ID}}" 2>/dev/null | wc -l)
    echo "$count ativos"

    if [ "$count" -gt 0 ]; then
        echo ""
        run_with_docker_group docker ps --filter "name=claude-docker" --format "    {{.Names}}\t{{.Status}}" 2>/dev/null
    fi

    echo ""
}

# ============================================
# COMANDO: logs
# ============================================
cmd_logs() {
    local target="${2:-all}"

    echo -e "${CYAN}Logs do Claude Docker Web (Ctrl+C para sair)${NC}"
    echo ""

    case "$target" in
        backend|back|b)
            if [ -f "$CONFIG_DIR/backend.log" ]; then
                tail -f "$CONFIG_DIR/backend.log"
            else
                log_warn "Log do backend não encontrado"
            fi
            ;;
        frontend|front|f)
            if [ -f "$CONFIG_DIR/frontend.log" ]; then
                tail -f "$CONFIG_DIR/frontend.log"
            else
                log_warn "Log do frontend não encontrado"
            fi
            ;;
        *)
            if [ -f "$CONFIG_DIR/backend.log" ] || [ -f "$CONFIG_DIR/frontend.log" ]; then
                tail -f "$CONFIG_DIR/backend.log" "$CONFIG_DIR/frontend.log" 2>/dev/null
            else
                log_warn "Nenhum log encontrado. O serviço está rodando?"
            fi
            ;;
    esac
}

# ============================================
# COMANDO: config
# ============================================
cmd_config() {
    mkdir -p "$CONFIG_DIR"

    if [ ! -f "$CONFIG_DIR/config.env" ]; then
        cat > "$CONFIG_DIR/config.env" << 'ENVEOF'
# Claude Docker Web Configuration
PORT=8000
ENABLE_AUTH=false
# REDIS_URL=redis://localhost:6379
# JWT_SECRET=your-secret-here
ENVEOF
        log_info "Arquivo de configuração criado: $CONFIG_DIR/config.env"
    fi

    ${EDITOR:-nano} "$CONFIG_DIR/config.env"
    log_info "Reinicie o serviço para aplicar: claude-docker-web restart"
}

# ============================================
# COMANDO: update
# ============================================
cmd_update() {
    log_info "Atualizando Claude Docker Web..."

    # Parar serviços primeiro
    cmd_stop 2>/dev/null || true

    cd "$INSTALL_DIR"

    # Pull updates
    if [ -d ".git" ]; then
        git pull 2>/dev/null || log_warn "Não foi possível atualizar via git"
    fi

    # Reinstall dependencies
    pnpm install

    # Rebuild
    pnpm build

    log_success "Atualizado!"
    log_info "Inicie o serviço: claude-docker-web start"
}

# ============================================
# COMANDO: build-images
# Construir imagens Docker
# ============================================
cmd_build_images() {
    log_info "Construindo imagens Docker..."
    echo ""

    if [ ! -d "$INSTALL_DIR/docker/base-image" ]; then
        log_error "Diretório de imagens não encontrado: $INSTALL_DIR/docker/base-image"
        exit 1
    fi

    cd "$INSTALL_DIR/docker/base-image"

    # Build imagem Claude
    if [ -f "Dockerfile.claude" ]; then
        echo ""
        log_info "Construindo claude-docker/claude..."
        run_with_docker_group docker build -t claude-docker/claude:latest -f Dockerfile.claude .
        log_success "Imagem claude-docker/claude construída"
    fi

    # Build imagem VS Code
    if [ -f "Dockerfile.vscode" ]; then
        echo ""
        log_info "Construindo claude-docker/vscode..."
        run_with_docker_group docker build -t claude-docker/vscode:latest -f Dockerfile.vscode .
        log_success "Imagem claude-docker/vscode construída"
    fi

    # Build imagem Both
    if [ -f "Dockerfile.both" ]; then
        echo ""
        log_info "Construindo claude-docker/both..."
        run_with_docker_group docker build -t claude-docker/both:latest -f Dockerfile.both .
        log_success "Imagem claude-docker/both construída"
    fi

    echo ""
    log_success "Todas as imagens foram construídas!"
    echo ""
    run_with_docker_group docker images --format "  {{.Repository}}:{{.Tag}}\t{{.Size}}" | grep "claude-docker"
}

# ============================================
# COMANDO: doctor
# Diagnóstico completo
# ============================================
cmd_doctor() {
    show_banner
    echo -e "${BOLD}Diagnóstico do Sistema${NC}"
    echo ""

    echo -e "${CYAN}Sistema:${NC}"
    echo "  OS: $(uname -s) $(uname -r)"
    echo "  User: $USER"
    echo "  Home: $HOME"
    echo ""

    echo -e "${CYAN}Dependências:${NC}"
    printf "  %-20s" "Node.js:"
    check_cmd node && echo "$(node --version)" || echo "NÃO INSTALADO"

    printf "  %-20s" "pnpm:"
    check_cmd pnpm && echo "$(pnpm --version)" || echo "NÃO INSTALADO"

    printf "  %-20s" "Docker:"
    check_cmd docker && echo "$(docker --version | cut -d' ' -f3 | tr -d ',')" || echo "NÃO INSTALADO"

    printf "  %-20s" "Redis:"
    check_cmd redis-server && echo "$(redis-server --version | cut -d' ' -f3 | tr -d 'v=')" || echo "NÃO INSTALADO (opcional)"

    printf "  %-20s" "Git:"
    check_cmd git && echo "$(git --version | cut -d' ' -f3)" || echo "NÃO INSTALADO"

    echo ""

    echo -e "${CYAN}Docker:${NC}"
    printf "  %-20s" "Daemon:"
    if run_with_docker_group docker info &>/dev/null 2>&1; then
        echo "RODANDO"
    elif systemctl is-active --quiet docker 2>/dev/null; then
        echo "RODANDO (sem acesso)"
    else
        echo "PARADO"
    fi

    printf "  %-20s" "Grupo docker:"
    if groups "$USER" | grep -qw docker; then
        if check_docker_group_active; then
            echo "OK (ativo)"
        else
            echo "OK (requer sg docker)"
        fi
    else
        echo "NÃO CONFIGURADO"
    fi

    printf "  %-20s" "Socket:"
    [ -S /var/run/docker.sock ] && echo "OK" || echo "NÃO ENCONTRADO"

    echo ""

    echo -e "${CYAN}Claude Code:${NC}"
    printf "  %-20s" "Credenciais:"
    [ -f "$HOME/.claude/.credentials.json" ] && echo "OK" || echo "NÃO AUTENTICADO"

    printf "  %-20s" "Settings:"
    [ -f "$HOME/.claude/settings.json" ] && echo "OK" || echo "NÃO ENCONTRADO"

    printf "  %-20s" "Skills:"
    [ -d "$HOME/.claude/skills" ] && echo "$(ls -1 $HOME/.claude/skills 2>/dev/null | wc -l) encontrados" || echo "0"

    printf "  %-20s" "Agents:"
    [ -d "$HOME/.claude/agents" ] && echo "$(ls -1 $HOME/.claude/agents 2>/dev/null | wc -l) encontrados" || echo "0"

    echo ""

    echo -e "${CYAN}SSH:${NC}"
    printf "  %-20s" "Diretório ~/.ssh:"
    [ -d "$HOME/.ssh" ] && echo "OK" || echo "NÃO EXISTE"

    printf "  %-20s" "Chave RSA:"
    [ -f "$HOME/.ssh/id_rsa" ] && echo "OK" || echo "NÃO ENCONTRADA"

    printf "  %-20s" "Chave Ed25519:"
    [ -f "$HOME/.ssh/id_ed25519" ] && echo "OK" || echo "NÃO ENCONTRADA"

    echo ""

    echo -e "${CYAN}Imagens Docker:${NC}"
    run_with_docker_group docker images --format "  {{.Repository}}:{{.Tag}}\t{{.Size}}" 2>/dev/null | grep "claude-docker" || echo "  Nenhuma imagem construída"

    echo ""

    echo -e "${CYAN}Instalação:${NC}"
    printf "  %-20s" "Diretório:"
    [ -d "$INSTALL_DIR" ] && echo "OK ($INSTALL_DIR)" || echo "NÃO ENCONTRADO"

    printf "  %-20s" "Config:"
    [ -f "$CONFIG_DIR/config.env" ] && echo "OK" || echo "PADRÃO"

    printf "  %-20s" "Backend dist:"
    [ -d "$INSTALL_DIR/packages/backend/dist" ] && echo "OK" || echo "NÃO COMPILADO"

    printf "  %-20s" "Frontend .next:"
    [ -d "$INSTALL_DIR/packages/frontend/.next" ] && echo "OK" || echo "NÃO COMPILADO"

    echo ""

    echo -e "${CYAN}Portas:${NC}"
    printf "  %-20s" "8000 (Backend):"
    if ss -tlnp 2>/dev/null | grep -q ":8000 "; then
        echo "EM USO"
    else
        echo "LIVRE"
    fi

    printf "  %-20s" "3000 (Frontend):"
    if ss -tlnp 2>/dev/null | grep -q ":3000 "; then
        echo "EM USO"
    else
        echo "LIVRE"
    fi

    echo ""
}

# ============================================
# COMANDO: help
# ============================================
cmd_help() {
    show_banner
    echo -e "${BOLD}Uso:${NC} claude-docker-web [comando]"
    echo ""
    echo -e "${BOLD}Comandos:${NC}"
    echo ""
    echo -e "  ${CYAN}init${NC}          Configuração inicial interativa"
    echo -e "                Verifica dependências, permissões, autenticação"
    echo ""
    echo -e "  ${CYAN}start${NC}         Iniciar o dashboard"
    echo -e "  ${CYAN}stop${NC}          Parar o dashboard"
    echo -e "  ${CYAN}restart${NC}       Reiniciar o dashboard"
    echo -e "  ${CYAN}status${NC}        Ver status dos serviços"
    echo -e "  ${CYAN}logs${NC}          Ver logs em tempo real"
    echo -e "                logs backend  - apenas backend"
    echo -e "                logs frontend - apenas frontend"
    echo ""
    echo -e "  ${CYAN}config${NC}        Editar configuração"
    echo -e "  ${CYAN}update${NC}        Atualizar para última versão"
    echo -e "  ${CYAN}build-images${NC}  Construir imagens Docker"
    echo -e "  ${CYAN}doctor${NC}        Diagnóstico completo do sistema"
    echo ""
    echo -e "  ${CYAN}help${NC}          Esta ajuda"
    echo -e "  ${CYAN}version${NC}       Mostrar versão"
    echo ""
    echo -e "${BOLD}Exemplos:${NC}"
    echo ""
    echo "  # Primeira vez? Execute:"
    echo -e "  ${DIM}claude-docker-web init${NC}"
    echo ""
    echo "  # Iniciar o dashboard:"
    echo -e "  ${DIM}claude-docker-web start${NC}"
    echo ""
    echo "  # Acessar:"
    echo -e "  ${DIM}http://localhost:3000${NC}"
    echo ""
}

# ============================================
# MAIN
# ============================================
main() {
    case "${1:-help}" in
        init)
            cmd_init
            ;;
        start)
            cmd_start
            ;;
        stop)
            cmd_stop
            ;;
        restart|rs)
            cmd_restart
            ;;
        status|st)
            cmd_status
            ;;
        logs|log)
            cmd_logs "$@"
            ;;
        config|cfg)
            cmd_config
            ;;
        update|up)
            cmd_update
            ;;
        build-images|build)
            cmd_build_images
            ;;
        doctor|diag)
            cmd_doctor
            ;;
        help|--help|-h)
            cmd_help
            ;;
        version|--version|-v)
            echo "claude-docker-web v$VERSION"
            ;;
        *)
            log_error "Comando desconhecido: $1"
            echo ""
            cmd_help
            exit 1
            ;;
    esac
}

main "$@"
