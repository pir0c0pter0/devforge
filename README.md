# Claude Docker

Gerenciador de ambientes Docker isolados com Claude Code.

Crie, gerencie e execute múltiplos ambientes de desenvolvimento com Claude Code, cada um com seu próprio repositório, configurações e workspace isolado.

## Instalação

```bash
# Clone o repositório
git clone https://github.com/pir0c0pter0/claude-docker.git

# Instale
cd claude-docker
./install.sh

# Ou instale manualmente
sudo cp claude-docker /usr/local/bin/
sudo chmod +x /usr/local/bin/claude-docker
```

## Uso Rápido

```bash
# Menu interativo
claude-docker

# Criar novo ambiente
claude-docker create

# Listar ambientes
claude-docker list

# Abrir shell em um ambiente
claude-docker shell meu-projeto

# Executar Claude Code
claude-docker claude meu-projeto
```

## Comandos

| Comando | Descrição |
|---------|-----------|
| `claude-docker` | Menu interativo |
| `claude-docker list` | Listar todos os ambientes |
| `claude-docker create` | Criar novo ambiente |
| `claude-docker start <nome>` | Iniciar ambiente |
| `claude-docker stop <nome>` | Parar ambiente |
| `claude-docker shell <nome>` | Abrir bash no ambiente |
| `claude-docker claude <nome>` | Executar Claude Code |
| `claude-docker update <nome>` | Atualizar Claude + configs |
| `claude-docker status <nome>` | Ver status detalhado |
| `claude-docker delete <nome>` | Deletar ambiente |

## O que cada ambiente inclui

- **Container isolado** com Node.js 22, pnpm, GitHub CLI
- **Claude Code** pré-instalado e atualizado
- **Suas configurações** copiadas automaticamente:
  - Agents (architect, planner, tdd-guide, code-reviewer, etc.)
  - Skills (backend-patterns, frontend-patterns, etc.)
  - Commands (gsd/*, build-fix, code-review, etc.)
  - Rules, Hooks, Plugins
- **SSH keys** montadas (read-only) para git
- **Workspace persistente** para seu código

## Pré-requisitos

- Docker e docker-compose
- jq (para manipulação JSON)
- Git
- Chave SSH configurada (para repos privados)
- Claude Code configurado no host (`~/.claude`)

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

## Estrutura de Diretórios

```
~/.claude-docker-envs/           # Ambientes criados
├── projeto-1/
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── .env
├── projeto-2/
│   └── ...

~/.config/claude-docker/         # Configurações do gerenciador
```

## Configuração

### API Key

Configure sua `ANTHROPIC_API_KEY` de uma das formas:

1. **Durante a criação** - O script pergunta
2. **Variável de ambiente** - `export ANTHROPIC_API_KEY=sk-ant-...`
3. **Arquivo .env** - Edite `~/.claude-docker-envs/<nome>/.env`

### SSH

Suas chaves SSH são montadas automaticamente em modo read-only:
- `~/.ssh` → `/home/developer/.ssh:ro`
- `~/.gitconfig` → `/home/developer/.gitconfig:ro`

## Exemplos

### Criar ambiente para um projeto existente

```bash
claude-docker create
# Nome: meu-projeto
# URL: https://github.com/user/repo.git
# API Key: (Enter para usar do ambiente)
```

### Trabalhar em múltiplos projetos

```bash
# Terminal 1
claude-docker claude projeto-frontend

# Terminal 2
claude-docker claude projeto-backend

# Terminal 3
claude-docker shell projeto-infra
```

### Atualizar após modificar configs no host

```bash
# Atualiza Claude Code e copia novas configs
claude-docker update meu-projeto
```

## Troubleshooting

### Docker não inicia

```bash
sudo systemctl start docker
```

### Permissão negada

```bash
sudo usermod -aG docker $USER
newgrp docker
```

### Limpar ambiente corrompido

```bash
claude-docker delete meu-projeto
claude-docker create
# Recriar com mesmo nome
```

## License

MIT
