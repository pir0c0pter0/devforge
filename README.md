<p align="center">
  <img src="https://img.shields.io/badge/Version-0.1.31--alpha-22c55e?style=for-the-badge" alt="Version">
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
- [Embedded Development](#-embedded-development)
- [Screenshots](#-screenshots)
- [Arquitetura](#-arquitetura)
- [Instalacao](#-instalacao)
- [Uso](#-uso)
- [Configuracao](#%EF%B8%8F-configuracao)
- [API Reference](#-api-reference)
- [Desenvolvimento](#-desenvolvimento)
- [Troubleshooting](#-troubleshooting)
- [Changelog](#-changelog)

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

### VS Code Integrado
| Recurso | Descricao |
|---------|-----------|
| **IDE no Navegador** | VS Code completo via code-server |
| **Persistencia** | IDE mantem estado ao trocar de aba |
| **Tema Dark** | Default Dark Modern pre-configurado |
| **Loading Progressivo** | Mensagens de progresso durante inicializacao |
| **Auto-Deteccao** | Extensoes recomendadas baseadas no projeto |

### Gerenciamento de Containers
- Criar containers com templates pre-configurados
- Iniciar/Parar containers com feedback de progresso
- Abrir terminal (shell) no container
- Abrir VS Code no navegador (embarcado)
- Monitorar recursos em tempo real
- Excluir containers com confirmacao

### Claude Chat
| Recurso | Descricao |
|---------|-----------|
| **Chat Integrado** | Converse com Claude dentro do container |
| **Historico** | Sessoes de conversa persistentes |
| **Contexto** | Continue conversas anteriores |
| **Logs** | Visualize logs do Docker em tempo real |

### Configuracoes Web
- Autenticacao do Claude Code via navegador
- Geracao de chaves SSH para GitHub
- Selecao de idioma (PT-BR/EN)
- Status do sistema (Docker, Redis, SSH)
- Visualizacao de configuracoes

---

## Embedded Development

### STM32 Development

Suporte completo para desenvolvimento de microcontroladores STM32:

| Ferramenta | Descricao |
|------------|-----------|
| **arm-none-eabi-gcc** | Toolchain ARM GCC para compilacao |
| **OpenOCD** | Debugger open-source para ARM |
| **ST-Link Tools** | Utilitarios para programacao via ST-Link |
| **gdb-multiarch** | Debugger multi-arquitetura |

**Extensoes VS Code instaladas:**
- `marus25.cortex-debug` - Debug ARM Cortex-M
- `ms-vscode.cpptools` - C/C++ IntelliSense
- `ms-vscode.cmake-tools` - Suporte CMake
- `twxs.cmake` - Syntax highlighting CMake
- `dan-c-underwood.arm` - ARM Assembly syntax
- `mcu-debug.memory-view` - Visualizador de memoria
- `mcu-debug.peripheral-viewer` - Visualizador de perifericos

### ESP32 Development (PlatformIO)

Ambiente completo para desenvolvimento ESP32 com PlatformIO:

| Ferramenta | Descricao |
|------------|-----------|
| **PlatformIO Core** | CLI e sistema de build |
| **PlatformIO IDE** | Extensao VS Code completa |
| **ESP-IDF Framework** | Framework oficial Espressif |
| **Toolchain ESP32** | Compilador Xtensa pre-instalado |

**Extensoes VS Code instaladas:**
- `platformio.platformio-ide` - IDE completo PlatformIO
- `ms-vscode.cpptools` - C/C++ IntelliSense
- `espressif.esp-idf-extension` - ESP-IDF oficial

### Como Usar

1. Ao criar um novo container, marque as opcoes desejadas:
   - **STM32 Development** - Para projetos com microcontroladores STM32
   - **ESP32 Development** - Para projetos com ESP32/ESP8266

2. A criacao do container levara mais tempo devido a instalacao das ferramentas

3. Ao abrir o VS Code, todas as extensoes estarao disponiveis

```
┌─────────────────────────────────────────────────────────────┐
│  # Embedded Development                                      │
│                                                              │
│  Pre-install toolchains for microcontroller development      │
│                                                              │
│  ☑ STM32 Development                                        │
│    ARM GCC, OpenOCD, ST-Link tools, Cortex-Debug extension  │
│                                                              │
│  ☑ ESP32 Development                                        │
│    PlatformIO IDE with ESP-IDF framework and full toolchain │
│                                                              │
│  ⚠ Container creation will take longer due to toolchain     │
│    installation                                              │
└─────────────────────────────────────────────────────────────┘
```

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
│  │ > meu-projeto       │ │ > firmware-stm32    │           │
│  │ [rodando] [ambos]   │ │ [rodando] [STM32]   │           │
│  │ CPU: 12% | Mem: 45% │ │ CPU: 8%  | Mem: 30% │           │
│  │ [Parar] [Terminal]  │ │ [IDE] [VS Code]     │           │
│  └─────────────────────┘ └─────────────────────┘           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### VS Code Embarcado
```
┌─────────────────────────────────────────────────────────────┐
│  Container: firmware-stm32                                  │
│  [Overview] [Terminal] [Claude] [Logs] [IDE]               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  VS Code - firmware-stm32                            │   │
│  │  ┌──────────┐┌──────────────────────────────────┐   │   │
│  │  │ EXPLORER ││  main.c                          │   │   │
│  │  │          ││                                   │   │   │
│  │  │ > src    ││  #include "stm32f4xx.h"          │   │   │
│  │  │   main.c ││                                   │   │   │
│  │  │   gpio.c ││  int main(void) {                │   │   │
│  │  │ > inc    ││    HAL_Init();                   │   │   │
│  │  │          ││    SystemClock_Config();         │   │   │
│  │  │          ││    MX_GPIO_Init();               │   │   │
│  │  └──────────┘└──────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────┘   │
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
│   │   │   ├── repositories/ # Acesso a dados (SQLite)
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
│       └── Dockerfile.both   # Claude + VS Code (recomendado)
│
├── scripts/                  # Scripts de gerenciamento
│   ├── install.sh            # Instalacao com systemd
│   ├── start.sh              # Iniciar servicos
│   ├── stop.sh               # Parar servicos
│   ├── restart.sh            # Reiniciar servicos
│   └── status.sh             # Status dos servicos
│
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
| **Backend** | SQLite | better-sqlite3 |
| **Shared** | Zod | 3.x |
| **Infra** | Docker | 24.x+ |
| **Infra** | code-server | 4.23.1 |
| **Cache** | Redis/Valkey | latest |

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

### Instalacao Rapida (systemd)

```bash
# 1. Clone o repositorio
git clone https://github.com/pir0c0pter0/claude-docker.git
cd claude-docker

# 2. Execute o instalador
./scripts/install.sh

# 3. Acesse o dashboard
# http://localhost:3000
```

### O que o instalador faz

1. Instala dependencias com `pnpm install`
2. Compila o projeto com `pnpm build`
3. Configura servicos systemd (backend e frontend)
4. Habilita auto-start no boot
5. Inicia os servicos automaticamente

### Comandos de Gerenciamento

```bash
# Scripts em ./scripts/
./scripts/start.sh      # Iniciar servicos
./scripts/stop.sh       # Parar servicos
./scripts/restart.sh    # Reiniciar servicos
./scripts/status.sh     # Ver status
./scripts/logs.sh       # Ver logs

# Ou via systemctl
systemctl --user status claude-docker-backend
systemctl --user status claude-docker-frontend
```

### Instalacao Manual (desenvolvimento)

```bash
# Clone
git clone https://github.com/pir0c0pter0/claude-docker.git
cd claude-docker

# Instale dependencias
pnpm install

# Build
pnpm build

# Inicie em modo desenvolvimento
pnpm dev
```

---

## Uso

### Iniciar o Dashboard

```bash
./scripts/start.sh
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

3. **Embedded Development** (opcional):
   - Marque **STM32 Development** para projetos STM32
   - Marque **ESP32 Development** para projetos ESP32/PlatformIO

4. Clique em **"Criar Container"**

### Acoes no Container

| Acao | Descricao |
|------|-----------|
| **Iniciar** | Inicia o container parado |
| **Parar** | Para o container em execucao |
| **Terminal** | Abre shell bash no container |
| **VS Code** | Abre IDE no navegador (aba IDE) |
| **Claude** | Abre chat com Claude (aba Claude) |
| **Logs** | Visualiza logs do Docker |
| **Excluir** | Remove container e dados |

### Abas do Container

| Aba | Conteudo |
|-----|----------|
| **Overview** | Metricas, graficos, informacoes gerais |
| **Terminal** | Shell interativo (bash/zsh) |
| **Claude** | Chat com Claude Code |
| **Logs** | Logs do Docker (All/Build/Runtime/Errors) |
| **IDE** | VS Code completo embarcado |

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
~/.config/claude-docker-web/        # Configuracao do usuario
├── data/
│   └── claude-docker.db            # Banco de dados SQLite
├── backend.log                     # Log do backend
└── frontend.log                    # Log do frontend

/var/log/                           # Logs systemd (se instalado)
├── claude-docker-backend.log
└── claude-docker-frontend.log
```

### Variaveis de Ambiente

Crie `.env` na raiz ou configure em `~/.config/claude-docker-web/`:

```env
# Servidor
PORT=8000
FRONTEND_PORT=3000
NODE_ENV=production

# Redis (opcional, usa in-memory se nao configurado)
REDIS_URL=redis://localhost:6379

# Limites padrao para novos containers
DEFAULT_CPU_LIMIT=2
DEFAULT_MEMORY_LIMIT=2048
DEFAULT_DISK_LIMIT=10240
```

### Portas Utilizadas

| Servico | Porta | Descricao |
|---------|-------|-----------|
| Frontend | 3000 | Interface web Next.js |
| Backend | 8000 | API REST + WebSocket |
| VS Code | 8080+ | code-server (alocacao dinamica) |

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
POST   /api/containers/:id/vscode   # Obter URL VS Code
```

### Claude Daemon

```
GET    /api/claude-daemon/:id/status     # Status do daemon
POST   /api/claude-daemon/:id/instruction # Enviar instrucao
GET    /api/claude-daemon/:id/messages   # Historico de mensagens
GET    /api/claude-daemon/:id/sessions   # Listar sessoes
GET    /api/claude-daemon/:id/sessions/:sessionId # Mensagens da sessao
```

### Docker Logs

```
GET    /api/docker-logs/:id         # Logs do container
GET    /api/docker-logs/:id/stats   # Estatisticas de logs
```

### WebSocket Namespaces

| Namespace | Eventos |
|-----------|---------|
| `/metrics` | container:metrics, container:status |
| `/tasks` | task:progress, task:complete, task:error |
| `/terminal` | data, resize |
| `/docker-logs` | logs:batch, logs:new |
| `/claude-daemon` | message, status, output |

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
perf: performance
```

---

## Troubleshooting

### Diagnostico Rapido

```bash
# Verificar status dos servicos
./scripts/status.sh

# Ver logs em tempo real
./scripts/logs.sh
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

# Aplicar sem logout
newgrp docker
```

### VS Code nao carrega

1. Verifique se o container esta rodando
2. Aguarde 30 segundos para o bootstrap completo
3. Verifique os logs do container na aba Logs

### Embedded tools nao funcionam

1. Verifique se marcou as opcoes ao criar o container
2. Para containers existentes, recrie com as opcoes marcadas
3. Verifique os logs de criacao do container

### Porta em uso

```bash
# Verificar processos nas portas
lsof -i :3000 -i :8000

# Parar servicos
./scripts/stop.sh
```

### Logs do sistema

```bash
# Todos os logs
./scripts/logs.sh

# Logs especificos
journalctl --user -u claude-docker-backend -f
journalctl --user -u claude-docker-frontend -f
```

---

## Changelog

### v0.1.31-alpha (Latest)
- **Feat**: Opcoes de Embedded Development na criacao de containers
- **Feat**: Suporte STM32 (ARM GCC, OpenOCD, ST-Link, Cortex-Debug)
- **Feat**: Suporte ESP32 (PlatformIO IDE completo com ESP-IDF)
- **Feat**: Extensoes VS Code pre-instaladas para desenvolvimento embarcado

### v0.1.30-alpha
- Fix: VS Code persiste ao trocar de aba (nao reinicia mais)
- Fix: Tempo de loading aumentado para 30s (bootstrap real)
- Feat: Mensagens progressivas durante loading do VS Code

### v0.1.29-alpha
- Fix: Conexoes WebSocket duplicadas eliminadas
- Fix: Headers de seguranca adicionados
- Perf: Deduplicacao de sockets com ref-counting

### v0.1.28-alpha
- Fix: Erros 404 vsda.js/vsda_bg.wasm corrigidos

### v0.1.25-alpha
- Feat: VS Code embarcado no site (aba IDE)

### v0.1.22-alpha
- Feat: Auto-deteccao de linguagem do projeto
- Feat: Extensoes recomendadas automaticas

### v0.1.16-alpha
- Feat: Historico de sessoes Claude
- Feat: Continuar conversas anteriores

### v0.1.9-alpha
- Feat: Logs Docker persistentes (24h)
- Feat: Virtual scrolling para logs

Ver historico completo em [CLAUDE.md](CLAUDE.md)

---

## Licenca

MIT License - veja [LICENSE](LICENSE)

---

<p align="center">
  <code>>_ claude-docker-web v0.1.31-alpha</code>
</p>

<p align="center">
  Feito com Claude Code
</p>

<p align="center">
  <a href="https://github.com/pir0c0pter0">@pir0c0pter0</a>
</p>
