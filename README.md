<p align="center">
  <img src="https://img.shields.io/badge/Version-1.1.0-22c55e?style=for-the-badge" alt="Version">
  <img src="https://img.shields.io/badge/License-MIT-22c55e?style=for-the-badge" alt="License">
  <img src="https://img.shields.io/badge/Next.js-15-0d1117?style=for-the-badge&logo=next.js&logoColor=white" alt="Next.js">
  <img src="https://img.shields.io/badge/Docker-Required-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker">
  <img src="https://img.shields.io/badge/TypeScript-5.0-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
</p>

```
   _____ _                 _        _____             _
  / ____| |               | |      |  __ \           | |
 | |    | | __ _ _   _  __| | ___  | |  | | ___   ___| | _____ _ __
 | |    | |/ _` | | | |/ _` |/ _ \ | |  | |/ _ \ / __| |/ / _ \ '__|
 | |____| | (_| | |_| | (_| |  __/ | |__| | (_) | (__|   <  __/ |
  \_____|_|\__,_|\__,_|\__,_|\___| |_____/ \___/ \___|_|\_\___|_|

  >_ Claude Docker Manager - Web Dashboard
```

<p align="center">
  <strong>Dashboard web para gerenciar containers Docker isolados com Claude Code e VS Code</strong>
</p>

---

## Indice

- [Funcionalidades](#-funcionalidades)
- [Screenshots](#-screenshots)
- [Arquitetura](#-arquitetura)
- [Instalacao](#-instalacao)
- [Uso](#-uso)
- [Configuracao](#%EF%B8%8F-configuracao)
- [API Reference](#-api-reference)
- [Desenvolvimento](#-desenvolvimento)
- [Troubleshooting](#-troubleshooting)

---

## Funcionalidades

### Dashboard Principal
| Recurso | Descricao |
|---------|-----------|
| **Containers Isolados** | Cada projeto em seu proprio container Docker |
| **Claude Code** | Assistente de IA para desenvolvimento integrado |
| **VS Code Server** | IDE completa no navegador via code-server |
| **Metricas Real-Time** | CPU, memoria e disco via WebSocket |
| **Tema Terminal** | Interface escura com cores verdes estilo terminal |
| **Multilingue** | Portugues (BR) e English |

### Gerenciamento de Containers
- Criar containers com templates pre-configurados
- Iniciar/Parar containers
- Abrir terminal (shell) no container
- Abrir VS Code no navegador
- Monitorar recursos em tempo real
- Excluir containers com confirmacao

### Configuracoes Web
- Autenticacao do Claude Code via navegador
- Geracao de chaves SSH para GitHub
- Selecao de idioma (PT-BR/EN)
- Status do sistema (Docker, Redis, SSH)
- Visualizacao de configuracoes

---

## Screenshots

### Tema Terminal Verde
```
┌─────────────────────────────────────────────────────────────┐
│  >_ Claude Docker Manager                                   │
│  Orquestracao de containers com IA                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  $ Painel                                                   │
│  Monitore e gerencie seus containers Docker                │
│                                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │
│  │ Total    │ │ Rodando  │ │ Agentes  │ │ Fila     │      │
│  │    3     │ │    2     │ │    5     │ │    0     │      │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘      │
│                                                             │
│  $ Containers                                               │
│  ┌─────────────────────┐ ┌─────────────────────┐           │
│  │ > meu-projeto       │ │ > outro-projeto     │           │
│  │ [rodando] [ambos]   │ │ [parado] [claude]   │           │
│  │ CPU: 12% | Mem: 45% │ │ CPU: 0%  | Mem: 0%  │           │
│  │ [Parar] [Terminal]  │ │ [Iniciar] [VS Code] │           │
│  └─────────────────────┘ └─────────────────────┘           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Arquitetura

```
claude-docker/
├── packages/
│   ├── backend/              # API Express + TypeScript
│   │   ├── src/
│   │   │   ├── api/routes/   # Endpoints REST
│   │   │   ├── services/     # Logica de negocios
│   │   │   ├── repositories/ # Acesso a dados
│   │   │   └── utils/        # Utilitarios
│   │   └── package.json
│   │
│   ├── frontend/             # Next.js 15 + React 19
│   │   ├── src/
│   │   │   ├── app/          # App Router pages
│   │   │   ├── components/   # Componentes React
│   │   │   ├── hooks/        # Custom hooks
│   │   │   ├── lib/          # Utilitarios + i18n
│   │   │   └── stores/       # Zustand stores
│   │   └── package.json
│   │
│   └── shared/               # Tipos compartilhados
│       ├── src/
│       │   ├── types/        # TypeScript types
│       │   └── schemas/      # Zod schemas
│       └── package.json
│
├── docker/
│   └── base-image/           # Dockerfiles dos containers
│       ├── Dockerfile.claude # Apenas Claude Code
│       ├── Dockerfile.vscode # Apenas VS Code
│       └── Dockerfile.both   # Claude + VS Code
│
├── install-local.sh          # Script de instalacao + inicializacao
├── package.json              # Workspace root
├── pnpm-workspace.yaml       # pnpm workspaces config
└── README.md                 # Esta documentacao
```

### Stack Tecnologico

| Camada | Tecnologia | Versao |
|--------|------------|--------|
| **Frontend** | Next.js | 15.x |
| **Frontend** | React | 19.x |
| **Frontend** | TailwindCSS | 3.x |
| **Frontend** | Zustand | 5.x |
| **Backend** | Express.js | 4.x |
| **Backend** | TypeScript | 5.x |
| **Backend** | Dockerode | 4.x |
| **Backend** | Socket.io | 4.x |
| **Shared** | Zod | 3.x |
| **Infra** | Docker | 24.x+ |
| **Infra** | code-server | latest |

---

## Instalacao

### Pre-requisitos

```bash
# Docker instalado e rodando
docker --version  # Docker 24.0+

# Node.js e pnpm
node --version    # Node 18+
pnpm --version    # pnpm 8+

# Usuario no grupo docker
groups | grep docker
```

### Instalacao no Linux

```bash
# 1. Clone o repositorio
git clone https://github.com/pir0c0pter0/claude-docker.git
cd claude-docker

# 2. Execute o instalador
./install-local.sh

# 3. Execute a configuracao inicial (primeira vez)
claude-docker-web init

# 4. Inicie o dashboard
claude-docker-web start
```

### O que o instalador faz

1. Instala dependencias com `pnpm install`
2. Compila o projeto com `pnpm build`
3. Copia arquivos para `~/.local/share/claude-docker-web/`
4. Cria script `claude-docker-web` em `~/.local/bin/`
5. Cria diretorio de config em `~/.config/claude-docker-web/`

### Comandos do CLI

| Comando | Descricao |
|---------|-----------|
| `claude-docker-web init` | Configuracao inicial interativa |
| `claude-docker-web start` | Iniciar backend e frontend |
| `claude-docker-web stop` | Parar todos os servicos |
| `claude-docker-web restart` | Reiniciar servicos |
| `claude-docker-web status` | Ver status dos servicos |
| `claude-docker-web logs` | Ver logs em tempo real |
| `claude-docker-web logs backend` | Ver apenas logs do backend |
| `claude-docker-web logs frontend` | Ver apenas logs do frontend |
| `claude-docker-web config` | Editar configuracao |
| `claude-docker-web build-images` | Construir imagens Docker |
| `claude-docker-web doctor` | Diagnostico completo |
| `claude-docker-web update` | Atualizar instalacao |
| `claude-docker-web help` | Mostrar ajuda |

### Configuracao Inicial (init)

O comando `init` verifica e configura automaticamente:

1. **Dependencias** - Node.js, pnpm, Docker
2. **Grupo docker** - Adiciona usuario ao grupo se necessario
3. **Docker daemon** - Inicia e habilita o servico
4. **Claude Code** - Configura autenticacao via navegador
5. **Chaves SSH** - Gera chaves para GitHub
6. **Imagens Docker** - Constroi as imagens base
7. **PATH** - Configura ~/.local/bin no PATH

### Tratamento de Permissoes Docker

O script detecta automaticamente se o grupo docker esta ativo:

- **Grupo ativo**: Executa comandos normalmente
- **Grupo inativo**: Usa `sg docker` automaticamente

Isso resolve o problema comum de precisar fazer logout/login apos adicionar ao grupo docker.

### Instalacao Manual

```bash
# Clone
git clone https://github.com/pir0c0pter0/claude-docker.git
cd claude-docker

# Instale dependencias
pnpm install

# Build
pnpm build

# Crie diretorios
mkdir -p ~/.local/share/claude-docker-web
mkdir -p ~/.local/bin
mkdir -p ~/.config/claude-docker-web

# Copie arquivos
cp -r packages docker node_modules pnpm-workspace.yaml package.json ~/.local/share/claude-docker-web/

# Copie o script CLI
cp install-local.sh ~/.local/bin/claude-docker-web
chmod +x ~/.local/bin/claude-docker-web

# Adicione ao PATH (se necessario)
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

---

## Uso

### Iniciar o Dashboard

```bash
claude-docker-web
```

Acesse: **http://localhost:3000**

### Criar Container

1. Clique em **"+ Novo Container"**
2. Preencha o formulario:

| Campo | Descricao | Exemplo |
|-------|-----------|---------|
| **Nome** | Identificador unico | `meu-projeto` |
| **Template** | Claude, VS Code ou Ambos | `Claude + VS Code` |
| **Modo** | Interativo ou Autonomo | `interativo` |
| **Repositorio** | Pasta vazia ou Clone GitHub | `https://github.com/user/repo` |
| **CPU** | Nucleos (1-16) | `2` |
| **Memoria** | MB (512-32768) | `2048` |
| **Disco** | GB (1-100) | `10` |

3. Clique em **"Criar Container"**

### Acoes no Container

| Acao | Descricao |
|------|-----------|
| **Iniciar** | Inicia o container parado |
| **Parar** | Para o container em execucao |
| **Terminal** | Abre shell bash no container |
| **VS Code** | Abre IDE no navegador |
| **Excluir** | Remove container e dados |

### Configuracoes

Acesse **Configuracoes** no menu para:

#### Idioma
- Portugues (Brasil) - padrao
- English

#### Claude Code Authentication
1. Clique em "Configurar autenticacao"
2. Execute `claude` no terminal
3. Siga as instrucoes para login via navegador
4. Clique em "Verificar autenticacao"

#### GitHub / SSH
1. Clique em "Configurar SSH"
2. Insira seu email
3. Clique em "Gerar chave SSH"
4. Copie a chave publica
5. Adicione ao GitHub em Settings > SSH Keys

---

## Configuracao

### Estrutura de Diretorios

```
~/.local/share/claude-docker-web/   # Instalacao
├── packages/
│   ├── backend/dist/               # Backend compilado
│   └── frontend/.next/             # Frontend compilado
└── docker/base-image/              # Dockerfiles

~/.config/claude-docker-web/        # Configuracao do usuario
├── config.env                      # Variaveis de ambiente
├── containers.json                 # Dados dos containers
├── backend.log                     # Log do backend
└── frontend.log                    # Log do frontend
```

### Variaveis de Ambiente

Edite `~/.config/claude-docker-web/config.env`:

```env
# Servidor
PORT=8000
FRONTEND_PORT=3000
NODE_ENV=production

# Redis (opcional)
REDIS_URL=redis://localhost:6379

# Limites padrao para novos containers
DEFAULT_CPU_LIMIT=2
DEFAULT_MEMORY_LIMIT=2048
DEFAULT_DISK_LIMIT=10240

# Autenticacao (desabilitada por padrao)
ENABLE_AUTH=false
JWT_SECRET=your-secret-key
```

### Portas Utilizadas

| Servico | Porta | Descricao |
|---------|-------|-----------|
| Frontend | 3000 | Interface web Next.js |
| Backend | 8000 | API REST + WebSocket |
| VS Code | 8080+ | code-server (por container) |

---

## API Reference

### Containers

```
GET    /api/containers              # Listar todos
POST   /api/containers              # Criar novo
GET    /api/containers/:id          # Obter por ID
POST   /api/containers/:id/start    # Iniciar
POST   /api/containers/:id/stop     # Parar
DELETE /api/containers/:id          # Excluir
GET    /api/containers/:id/metrics  # Metricas
GET    /api/containers/:id/logs     # Logs
```

### Settings

```
GET    /api/settings/claude-status  # Status do Claude
GET    /api/settings/system-status  # Status do sistema
GET    /api/settings/config         # Configuracoes
POST   /api/settings/generate-ssh-key # Gerar SSH
POST   /api/settings/open-claude-auth # Iniciar auth
POST   /api/settings/logout-claude  # Logout Claude
```

### WebSocket Events

```javascript
// Conectar
const socket = io('http://localhost:8000')

// Eventos recebidos
socket.on('container:metrics', (data) => {
  // { containerId, cpu, memory, disk }
})

socket.on('container:status', (data) => {
  // { containerId, status }
})
```

---

## Desenvolvimento

### Setup Local

```bash
# Clone
git clone https://github.com/pir0c0pter0/claude-docker.git
cd claude-docker

# Instale dependencias
pnpm install

# Inicie em modo desenvolvimento
pnpm dev
```

### Scripts Disponiveis

| Script | Descricao |
|--------|-----------|
| `pnpm dev` | Inicia backend e frontend em dev |
| `pnpm build` | Compila todos os pacotes |
| `pnpm test` | Executa testes |
| `pnpm lint` | Verifica codigo |
| `pnpm typecheck` | Verifica tipos TypeScript |

### Estrutura de Commits

```
feat: nova funcionalidade
fix: correcao de bug
docs: documentacao
style: formatacao
refactor: refatoracao
test: testes
chore: manutencao
```

---

## Troubleshooting

### Diagnostico Rapido

```bash
# Execute o diagnostico completo
claude-docker-web doctor
```

### Docker nao inicia

```bash
# Verificar status
sudo systemctl status docker

# Iniciar Docker
sudo systemctl start docker
sudo systemctl enable docker
```

### Permissao negada no Docker

```bash
# Adicionar usuario ao grupo docker
sudo usermod -aG docker $USER

# Opcao 1: Aplicar sem logout
newgrp docker

# Opcao 2: O script usa 'sg docker' automaticamente
claude-docker-web start  # Funciona mesmo sem relogin
```

O script v1.1.0 detecta automaticamente se o grupo docker esta ativo e usa `sg docker` quando necessario.

### Backend nao inicia (EACCES docker.sock)

Se o backend falhar com erro de permissao no socket do Docker:

```bash
# O script ja resolve isso automaticamente com sg docker
claude-docker-web start

# Ou manualmente:
sg docker -c "cd ~/.local/share/claude-docker-web/packages/backend && PORT=8000 ENABLE_AUTH=false node dist/index.js"
```

### Imagens Docker nao encontradas

```bash
# Construir todas as imagens
claude-docker-web build-images

# Ou durante o init
claude-docker-web init
# Responda 'Y' quando perguntar sobre construir imagens
```

### Porta em uso

```bash
# Verificar processos nas portas
lsof -i :3000 -i :8000

# O script stop ja libera as portas
claude-docker-web stop

# Ou matar manualmente
fuser -k 3000/tcp 8000/tcp
```

### Erro de build nos Dockerfiles

Os Dockerfiles v1.1.0 corrigem problemas de UID e permissoes pnpm:

```bash
# Reconstruir imagens com a versao corrigida
claude-docker-web build-images
```

### Erro de build do projeto

```bash
# Limpar e reinstalar
cd ~/.local/share/claude-docker-web
rm -rf node_modules packages/*/node_modules
pnpm install
pnpm build
```

### Container nao conecta SSH

```bash
# Verificar permissoes das chaves
chmod 700 ~/.ssh
chmod 600 ~/.ssh/id_*
chmod 644 ~/.ssh/*.pub
```

### Logs do sistema

```bash
# Todos os logs
claude-docker-web logs

# Apenas backend
claude-docker-web logs backend

# Apenas frontend
claude-docker-web logs frontend

# Ou diretamente
tail -f ~/.config/claude-docker-web/backend.log
tail -f ~/.config/claude-docker-web/frontend.log
```

### Verificar Status Completo

```bash
claude-docker-web status
```

Mostra:
- Backend (PID + API status)
- Frontend (PID + HTTP status)
- Docker (acessibilidade)
- Redis (se instalado)
- Containers ativos

---

## Licenca

MIT License - veja [LICENSE](LICENSE)

---

<p align="center">
  <code>>_ claude-docker-web v1.1.0</code>
</p>

<p align="center">
  Feito com Claude Code no CachyOS
</p>

<p align="center">
  <a href="https://github.com/pir0c0pter0">@pir0c0pter0</a>
</p>
