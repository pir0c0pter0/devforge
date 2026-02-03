#!/bin/bash
#
# Claude Docker Web - Gerenciador de Containers com Claude Code + VS Code
#
set -e

VERSION="1.0.0"
INSTALL_DIR="/home/mariostjr/.local/share/claude-docker-web"
CONFIG_DIR="/home/mariostjr/.config/claude-docker-web"
BIN_DIR="/home/mariostjr/.local/bin"

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
                                                            Web v1.0
EOF
    echo -e "${NC}"
}

# Verificar se comando existe
check_cmd() {
    command -v "$1" &>/dev/null
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

    # Redis
    if check_cmd redis-server; then
        log_success "Redis instalado"
    else
        log_warn "Redis não encontrado (opcional, mas recomendado)"
        echo ""
        read -p "  Deseja instalar o Redis agora? (Y/n) " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Nn]$ ]]; then
            if check_cmd pacman; then
                sudo pacman -S redis --noconfirm
            elif check_cmd apt; then
                sudo apt install -y redis-server
            fi
            log_success "Redis instalado"
        fi
    fi

    echo ""

    # ========== 2. Verificar grupo Docker ==========
    log_step "Verificando permissões do Docker..."
    echo ""

    if groups | grep -q docker; then
        log_success "Usuário está no grupo 'docker'"
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

    if docker info &>/dev/null 2>&1; then
        log_success "Docker daemon está rodando"
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
                claude --help &>/dev/null || npx @anthropic-ai/claude-code --help &>/dev/null || true

                # Tentar abrir o claude para login
                timeout 60 claude 2>/dev/null || timeout 60 npx @anthropic-ai/claude-code 2>/dev/null || true

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

    if docker images | grep -q "claude-docker/full"; then
        log_success "Imagem claude-docker/full encontrada"
    else
        log_warn "Imagens Docker não encontradas"
        echo ""
        read -p "  Deseja construir as imagens agora? (pode demorar ~5min) (Y/n) " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Nn]$ ]]; then
            if [ -d "$INSTALL_DIR/docker/base-image" ]; then
                log_info "Construindo imagens..."
                cd "$INSTALL_DIR/docker/base-image"

                # Build imagem completa
                if [ -f "Dockerfile.both" ]; then
                    docker build -t claude-docker/full:latest -f Dockerfile.both . 2>&1 | tail -5
                    log_success "Imagem claude-docker/full construída"
                fi

                # Build imagem só Claude
                if [ -f "Dockerfile.claude" ]; then
                    docker build -t claude-docker/claude:latest -f Dockerfile.claude . 2>&1 | tail -5
                    log_success "Imagem claude-docker/claude construída"
                fi

                # Build imagem só VS Code
                if [ -f "Dockerfile.vscode" ]; then
                    docker build -t claude-docker/vscode:latest -f Dockerfile.vscode . 2>&1 | tail -5
                    log_success "Imagem claude-docker/vscode construída"
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
    docker info &>/dev/null 2>&1 && echo -e "${GREEN}RODANDO${NC}" || echo -e "${RED}PARADO${NC}"

    printf "  %-30s" "Grupo docker:"
    groups | grep -q docker && echo -e "${GREEN}OK${NC}" || echo -e "${YELLOW}PENDENTE (relogin)${NC}"

    printf "  %-30s" "Claude autenticado:"
    [ -f "$HOME/.claude/.credentials.json" ] && echo -e "${GREEN}OK${NC}" || echo -e "${YELLOW}PENDENTE${NC}"

    printf "  %-30s" "SSH keys:"
    [ -f "$HOME/.ssh/id_rsa" -o -f "$HOME/.ssh/id_ed25519" ] && echo -e "${GREEN}OK${NC}" || echo -e "${YELLOW}OPCIONAL${NC}"

    printf "  %-30s" "Imagens Docker:"
    docker images | grep -q "claude-docker" && echo -e "${GREEN}OK${NC}" || echo -e "${YELLOW}NÃO CONSTRUÍDAS${NC}"

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
    if ! docker info &>/dev/null 2>&1; then
        log_error "Docker daemon não está rodando"
        log_info "Execute: sudo systemctl start docker"
        log_info "Ou execute: claude-docker-web init"
        exit 1
    fi

    # Iniciar Redis se não estiver rodando
    if check_cmd redis-server; then
        if ! pgrep -x redis-server > /dev/null; then
            log_info "Iniciando Redis..."
            redis-server --daemonize yes 2>/dev/null || true
        fi
    fi

    # Copiar config
    mkdir -p "$CONFIG_DIR"
    if [ -f "$CONFIG_DIR/config.env" ]; then
        cp "$CONFIG_DIR/config.env" "$INSTALL_DIR/packages/backend/.env" 2>/dev/null || true
    fi

    # Verificar se já está rodando
    if [ -f "$CONFIG_DIR/backend.pid" ] && kill -0 $(cat "$CONFIG_DIR/backend.pid") 2>/dev/null; then
        log_warn "Backend já está rodando (PID: $(cat $CONFIG_DIR/backend.pid))"
    else
        # Iniciar backend
        cd "$INSTALL_DIR/packages/backend"
        PORT=8000 node dist/index.js > "$CONFIG_DIR/backend.log" 2>&1 &
        BACKEND_PID=$!
        echo "$BACKEND_PID" > "$CONFIG_DIR/backend.pid"
        log_success "Backend iniciado (PID: $BACKEND_PID)"
    fi

    if [ -f "$CONFIG_DIR/frontend.pid" ] && kill -0 $(cat "$CONFIG_DIR/frontend.pid") 2>/dev/null; then
        log_warn "Frontend já está rodando (PID: $(cat $CONFIG_DIR/frontend.pid))"
    else
        # Iniciar frontend
        cd "$INSTALL_DIR/packages/frontend"
        PORT=3000 npx next start > "$CONFIG_DIR/frontend.log" 2>&1 &
        FRONTEND_PID=$!
        echo "$FRONTEND_PID" > "$CONFIG_DIR/frontend.pid"
        log_success "Frontend iniciado (PID: $FRONTEND_PID)"
    fi

    sleep 2
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

    if [ -f "$CONFIG_DIR/backend.pid" ]; then
        kill $(cat "$CONFIG_DIR/backend.pid") 2>/dev/null || true
        rm -f "$CONFIG_DIR/backend.pid"
        log_success "Backend parado"
    fi

    if [ -f "$CONFIG_DIR/frontend.pid" ]; then
        kill $(cat "$CONFIG_DIR/frontend.pid") 2>/dev/null || true
        rm -f "$CONFIG_DIR/frontend.pid"
        log_success "Frontend parado"
    fi

    # Matar processos órfãos
    pkill -f "claude-docker-web.*node" 2>/dev/null || true

    echo ""
    log_success "Claude Docker Web parado"
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
        echo -e "${GREEN}RODANDO${NC} (PID: $(cat $CONFIG_DIR/backend.pid))"
    else
        echo -e "${RED}PARADO${NC}"
    fi

    # Frontend
    printf "  %-15s" "Frontend:"
    if [ -f "$CONFIG_DIR/frontend.pid" ] && kill -0 $(cat "$CONFIG_DIR/frontend.pid") 2>/dev/null; then
        echo -e "${GREEN}RODANDO${NC} (PID: $(cat $CONFIG_DIR/frontend.pid))"
    else
        echo -e "${RED}PARADO${NC}"
    fi

    # Docker
    printf "  %-15s" "Docker:"
    if docker info &>/dev/null 2>&1; then
        echo -e "${GREEN}RODANDO${NC}"
    else
        echo -e "${RED}PARADO${NC}"
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
    local count=$(docker ps --filter "label=claude-docker.id" --format "{{.ID}}" 2>/dev/null | wc -l)
    echo "$count ativos"

    if [ "$count" -gt 0 ]; then
        echo ""
        docker ps --filter "label=claude-docker.id" --format "    {{.Names}}\t{{.Status}}" 2>/dev/null
    fi

    echo ""
}

# ============================================
# COMANDO: logs
# ============================================
cmd_logs() {
    echo -e "${CYAN}Logs do Claude Docker Web (Ctrl+C para sair)${NC}"
    echo ""

    if [ -f "$CONFIG_DIR/backend.log" ] || [ -f "$CONFIG_DIR/frontend.log" ]; then
        tail -f "$CONFIG_DIR/backend.log" "$CONFIG_DIR/frontend.log" 2>/dev/null
    else
        log_warn "Nenhum log encontrado. O serviço está rodando?"
    fi
}

# ============================================
# COMANDO: config
# ============================================
cmd_config() {
    ${EDITOR:-nano} "$CONFIG_DIR/config.env"
    log_info "Reinicie o serviço para aplicar: claude-docker-web stop && claude-docker-web start"
}

# ============================================
# COMANDO: update
# ============================================
cmd_update() {
    log_info "Atualizando Claude Docker Web..."

    cd "$INSTALL_DIR"

    # Pull updates
    git pull 2>/dev/null || log_warn "Não foi possível atualizar via git"

    # Reinstall dependencies
    pnpm install

    # Rebuild
    pnpm build

    log_success "Atualizado!"
    log_info "Reinicie o serviço: claude-docker-web stop && claude-docker-web start"
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
    check_cmd redis-server && echo "$(redis-server --version | cut -d' ' -f3 | tr -d 'v=')" || echo "NÃO INSTALADO"

    printf "  %-20s" "Git:"
    check_cmd git && echo "$(git --version | cut -d' ' -f3)" || echo "NÃO INSTALADO"

    echo ""

    echo -e "${CYAN}Docker:${NC}"
    printf "  %-20s" "Daemon:"
    docker info &>/dev/null 2>&1 && echo "RODANDO" || echo "PARADO"

    printf "  %-20s" "Grupo docker:"
    groups | grep -q docker && echo "OK" || echo "USUÁRIO NÃO ESTÁ NO GRUPO"

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
    docker images --format "  {{.Repository}}:{{.Tag}}\t{{.Size}}" 2>/dev/null | grep "claude-docker" || echo "  Nenhuma imagem construída"

    echo ""

    echo -e "${CYAN}Instalação:${NC}"
    printf "  %-20s" "Diretório:"
    [ -d "$INSTALL_DIR" ] && echo "OK" || echo "NÃO ENCONTRADO"

    printf "  %-20s" "Config:"
    [ -f "$CONFIG_DIR/config.env" ] && echo "OK" || echo "NÃO ENCONTRADO"

    printf "  %-20s" "Backend dist:"
    [ -d "$INSTALL_DIR/packages/backend/dist" ] && echo "OK" || echo "NÃO COMPILADO"

    printf "  %-20s" "Frontend .next:"
    [ -d "$INSTALL_DIR/packages/frontend/.next" ] && echo "OK" || echo "NÃO COMPILADO"

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
    echo -e "  ${CYAN}init${NC}      Configuração inicial interativa"
    echo -e "            Verifica dependências, permissões, autenticação"
    echo ""
    echo -e "  ${CYAN}start${NC}     Iniciar o dashboard"
    echo -e "  ${CYAN}stop${NC}      Parar o dashboard"
    echo -e "  ${CYAN}status${NC}    Ver status dos serviços"
    echo -e "  ${CYAN}logs${NC}      Ver logs em tempo real"
    echo ""
    echo -e "  ${CYAN}config${NC}    Editar configuração"
    echo -e "  ${CYAN}update${NC}    Atualizar para última versão"
    echo -e "  ${CYAN}doctor${NC}    Diagnóstico completo do sistema"
    echo ""
    echo -e "  ${CYAN}help${NC}      Esta ajuda"
    echo -e "  ${CYAN}version${NC}   Mostrar versão"
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
        status|st)
            cmd_status
            ;;
        logs|log)
            cmd_logs
            ;;
        config|cfg)
            cmd_config
            ;;
        update|up)
            cmd_update
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
