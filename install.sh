#!/bin/bash
#
# Instalador do claude-docker
#
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="/usr/local/bin"
SCRIPT_NAME="claude-docker"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}Instalando claude-docker...${NC}"
echo ""

# Verificar dependencias
missing=()
command -v docker &>/dev/null || missing+=("docker")
command -v docker-compose &>/dev/null || missing+=("docker-compose")
command -v jq &>/dev/null || missing+=("jq")
command -v git &>/dev/null || missing+=("git")

if [ ${#missing[@]} -gt 0 ]; then
    echo -e "${YELLOW}Dependencias faltando: ${missing[*]}${NC}"
    echo ""

    # Detectar distro
    if command -v pacman &>/dev/null; then
        echo "Instale com: sudo pacman -S ${missing[*]}"
    elif command -v apt &>/dev/null; then
        echo "Instale com: sudo apt install ${missing[*]}"
    elif command -v dnf &>/dev/null; then
        echo "Instale com: sudo dnf install ${missing[*]}"
    fi
    echo ""
    read -p "Continuar mesmo assim? (y/N) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Instalar
echo -e "${BLUE}Copiando para $INSTALL_DIR...${NC}"

if [ -w "$INSTALL_DIR" ]; then
    cp "$SCRIPT_DIR/$SCRIPT_NAME" "$INSTALL_DIR/"
    chmod +x "$INSTALL_DIR/$SCRIPT_NAME"
else
    sudo cp "$SCRIPT_DIR/$SCRIPT_NAME" "$INSTALL_DIR/"
    sudo chmod +x "$INSTALL_DIR/$SCRIPT_NAME"
fi

# Criar diretorios
mkdir -p "$HOME/.config/claude-docker"
mkdir -p "$HOME/.claude-docker-envs"

echo ""
echo -e "${GREEN}Instalado com sucesso!${NC}"
echo ""
echo "Uso:"
echo "  claude-docker          # Menu interativo"
echo "  claude-docker create   # Criar ambiente"
echo "  claude-docker help     # Ajuda"
echo ""

# Verificar Docker
if ! docker info &>/dev/null; then
    echo -e "${YELLOW}Aviso: Docker daemon nao esta rodando${NC}"
    echo "  sudo systemctl start docker"
    echo ""
fi

# Verificar grupo docker
if ! groups | grep -q docker; then
    echo -e "${YELLOW}Aviso: Usuario nao esta no grupo docker${NC}"
    echo "  sudo usermod -aG docker \$USER"
    echo "  newgrp docker"
    echo ""
fi
