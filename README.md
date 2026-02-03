<p align="center">
  <img src="https://img.shields.io/badge/Version-1.0.0-blue?style=for-the-badge" alt="Version">
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License">
  <img src="https://img.shields.io/badge/Bash-5.0+-yellow?style=for-the-badge&logo=gnubash&logoColor=white" alt="Bash">
  <img src="https://img.shields.io/badge/Docker-Required-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker">
</p>

<h1 align="center">🐳 Claude Docker</h1>

<p align="center">
  <strong>Gerenciador de ambientes Docker isolados com Claude Code</strong>
</p>

<p align="center">
  <a href="#-funcionalidades">Funcionalidades</a> •
  <a href="#-inicio-rapido">Inicio Rapido</a> •
  <a href="#-comandos">Comandos</a> •
  <a href="#-uso">Uso</a> •
  <a href="#-configuracao">Configuracao</a>
</p>

---

## 🌟 Funcionalidades

Crie, gerencie e execute **multiplos ambientes de desenvolvimento** com Claude Code, cada um com seu proprio repositorio, configuracoes e workspace isolado.

| Recurso | Descricao |
|---------|-----------|
| 🐳 **Ambientes Isolados** | Cada projeto em seu proprio container Docker |
| 🤖 **Claude Code Pre-instalado** | Pronto para uso imediato |
| 📦 **Configs Automaticas** | Copia agents, skills, commands, rules, plugins |
| 🔑 **SSH Integrado** | Chaves montadas para git funcionar |
| 💾 **Workspaces Persistentes** | Dados salvos em volumes Docker |
| 🎯 **Menu Interativo** | Interface amigavel para gerenciamento |

### ✨ Destaques

- 🔒 **Isolamento total** entre projetos
- 📋 **Lista ambientes** com status (running/stopped)
- 🔄 **Atualiza Claude Code** e configs com um comando
- 🗑️ **Deleta com seguranca** (confirmacao obrigatoria)
- 🚀 **Multi-projeto** - trabalhe em varios ao mesmo tempo

---

## 🚀 Inicio Rapido

### Instalacao

```bash
# Clone o repositorio
git clone https://github.com/pir0c0pter0/claude-docker.git
cd claude-docker

# Instale
./install.sh

# Ou instale manualmente
sudo cp claude-docker /usr/local/bin/
sudo chmod +x /usr/local/bin/claude-docker
```

### Primeiro Uso

```bash
# Menu interativo
claude-docker

# Ou crie um ambiente diretamente
claude-docker create
```

---

## 📖 Comandos

| Comando | Alias | Descricao |
|---------|-------|-----------|
| `claude-docker` | - | Menu interativo |
| `claude-docker list` | `ls` | Listar todos os ambientes |
| `claude-docker create` | `new` | Criar novo ambiente |
| `claude-docker start <nome>` | - | Iniciar ambiente |
| `claude-docker stop <nome>` | - | Parar ambiente |
| `claude-docker shell <nome>` | `sh` | Abrir bash no container |
| `claude-docker claude <nome>` | `c` | Executar Claude Code |
| `claude-docker update <nome>` | `up` | Atualizar Claude + configs |
| `claude-docker status <nome>` | `st` | Ver status detalhado |
| `claude-docker delete <nome>` | `rm` | Deletar ambiente |

---

## 🎯 Uso

### 💬 Menu Interativo

```bash
claude-docker
```

```
   _____ _                 _        _____             _
  / ____| |               | |      |  __ \           | |
 | |    | | __ _ _   _  __| | ___  | |  | | ___   ___| | _____ _ __
 | |    | |/ _` | | | |/ _` |/ _ \ | |  | |/ _ \ / __| |/ / _ \ '__|
 | |____| | (_| | |_| | (_| |  __/ | |__| | (_) | (__|   <  __/ |
  \_____|_|\__,_|\__,_|\__,_|\___| |_____/ \___/ \___|_|\_\___|_|

  Gerenciador de ambientes Docker com Claude Code v1.0.0

Menu Principal:

  1) Listar ambientes
  2) Criar novo ambiente
  3) Iniciar ambiente
  4) Parar ambiente
  5) Abrir shell
  6) Executar Claude Code
  7) Atualizar ambiente
  8) Ver status
  9) Deletar ambiente
  0) Sair
```

### 📋 Listar Ambientes

```bash
claude-docker list
```

```
Ambientes Claude Docker:

#    NOME                 STATUS       REPOSITORIO                    CRIADO
------------------------------------------------------------------------------------------
1    meu-projeto          running      github.com/user/repo           2026-02-03
2    outro-projeto        stopped      github.com/user/other          2026-02-01
3    teste                not built    -                              2026-01-30
```

### 🆕 Criar Ambiente

```bash
claude-docker create
```

O assistente pergunta:
1. **Nome do ambiente** - identificador unico
2. **URL do repositorio** - opcional, clona automaticamente
3. **ANTHROPIC_API_KEY** - ou usa do ambiente

### 🖥️ Trabalhar em Multiplos Projetos

```bash
# Terminal 1 - Frontend
claude-docker claude projeto-frontend

# Terminal 2 - Backend
claude-docker claude projeto-backend

# Terminal 3 - Infraestrutura
claude-docker shell projeto-infra
```

### 🔄 Atualizar Apos Modificar Configs no Host

```bash
# Atualiza Claude Code e copia novas configs
claude-docker update meu-projeto
```

---

## ⚙️ Configuracao

### 📁 Estrutura de Diretorios

```
~/.claude-docker-envs/           # Ambientes criados
├── projeto-1/
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── .env
├── projeto-2/
│   └── ...

~/.config/claude-docker/         # Configuracoes do gerenciador
```

### 🔐 API Key

Configure sua `ANTHROPIC_API_KEY` de uma das formas:

| Metodo | Descricao |
|--------|-----------|
| **Durante criacao** | O script pergunta interativamente |
| **Variavel de ambiente** | `export ANTHROPIC_API_KEY=sk-ant-...` |
| **Arquivo .env** | Edite `~/.claude-docker-envs/<nome>/.env` |

### 🔑 SSH

Suas chaves SSH sao montadas automaticamente em modo read-only:

```
~/.ssh        → /home/developer/.ssh:ro
~/.gitconfig  → /home/developer/.gitconfig:ro
```

Isso permite clonar repositorios privados sem configuracao adicional.

---

## 📦 O que cada ambiente inclui

### 🐳 Container

| Componente | Versao/Descricao |
|------------|------------------|
| **Base** | Node.js 22 (Debian Bookworm) |
| **Package Manager** | pnpm (latest) |
| **CLI Tools** | git, curl, wget, vim, nano, jq, zsh |
| **GitHub CLI** | gh (latest) |
| **Claude Code** | @anthropic-ai/claude-code |

### 🤖 Configuracoes Copiadas

| Diretorio | Descricao |
|-----------|-----------|
| `~/.claude/agents/` | architect, planner, tdd-guide, code-reviewer, security-reviewer, build-error-resolver, e2e-runner, refactor-cleaner, doc-updater, GSD agents |
| `~/.claude/skills/` | backend-patterns, frontend-patterns, security-review, tdd-workflow, coding-standards, etc. |
| `~/.claude/commands/` | gsd/*, build-fix, code-review, e2e, plan, tdd, test-coverage, multi-perspective |
| `~/.claude/rules/` | Regras globais de codigo |
| `~/.claude/hooks/` | Hooks de sessao |
| `~/.claude/plugins/` | Plugins instalados |
| `~/.claude/get-shit-done/` | Workflow GSD completo |

---

## 📋 Pre-requisitos

### CachyOS / Arch Linux

```bash
sudo pacman -S docker docker-compose jq git
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
# Logout/login ou: newgrp docker
```

### Ubuntu / Debian

```bash
sudo apt install docker.io docker-compose jq git
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
```

### Fedora

```bash
sudo dnf install docker docker-compose jq git
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
```

---

## 🔧 Troubleshooting

### Docker nao inicia

```bash
sudo systemctl start docker
sudo systemctl enable docker
```

### Permissao negada no Docker

```bash
sudo usermod -aG docker $USER
newgrp docker
```

### Ambiente corrompido

```bash
claude-docker delete meu-projeto
claude-docker create
# Recriar com mesmo nome
```

### Container nao conecta SSH

```bash
# Verificar permissoes das chaves
chmod 700 ~/.ssh
chmod 600 ~/.ssh/id_*
```

---

## 📄 Licenca

MIT License - veja [LICENSE](LICENSE)

---

<p align="center">
  Feito com 🐳 e Claude Code no CachyOS 🐧
</p>

<p align="center">
  <strong>Autor:</strong> <a href="https://github.com/pir0c0pter0">@pir0c0pter0</a>
</p>
