# Claude Docker Web - Instruções

## Versão Atual: 0.0.30-alpha

## Estrutura do Projeto

```
claude-docker/
├── packages/
│   ├── frontend/     # Next.js 15 (porta 3000)
│   ├── backend/      # Express + Dockerode (porta 8000)
│   └── shared/       # Tipos compartilhados
├── scripts/          # Scripts de gerenciamento
│   ├── start.sh      # Iniciar serviços
│   ├── stop.sh       # Parar serviços
│   ├── restart.sh    # Reiniciar serviços
│   ├── status.sh     # Ver status
│   ├── logs.sh       # Ver logs
│   └── diagnose.sh   # Diagnóstico do sistema
└── docker/           # Dockerfiles para containers
```

## Scripts de Gerenciamento

```bash
# Iniciar todos os serviços
./scripts/start.sh

# Parar todos os serviços
./scripts/stop.sh

# Reiniciar serviços
./scripts/restart.sh

# Ver status dos serviços
./scripts/status.sh

# Ver logs
./scripts/logs.sh

# Executar diagnóstico do sistema
./scripts/diagnose.sh
```

## API Endpoints

### Containers
- `GET /api/containers` - Listar containers
- `POST /api/containers` - Criar container
- `GET /api/containers/:id` - Detalhes do container
- `DELETE /api/containers/:id` - Excluir container
- `POST /api/containers/:id/start` - Iniciar container
- `POST /api/containers/:id/stop` - Parar container

### Templates
- `GET /api/templates` - Listar templates disponíveis

### Diagnósticos
- `GET /api/diagnostics` - Executar todos os diagnósticos
- `GET /api/diagnostics/:check` - Executar diagnóstico específico
  - Checks: docker, group, images, containers, redis, ssh, ports, disk

### Settings
- `GET /api/settings/claude-status` - Status da autenticação Claude
- `GET /api/settings/system-status` - Status do sistema
- `GET /api/settings/config` - Configurações
- `POST /api/settings/open-claude-auth` - Instruções de autenticação
- `POST /api/settings/logout-claude` - Logout do Claude
- `POST /api/settings/generate-ssh-key` - Gerar chave SSH

## Git Workflow (OBRIGATÓRIO)

### Após commit/push, SEMPRE recompilar e reiniciar

**Depois de fazer push, SEMPRE rodar:**

```bash
pnpm build
./scripts/restart.sh
```

Isso garante que as mudanças apareçam no PC do usuário.

### Fluxo completo:

1. Fazer as alterações
2. `pnpm build` - verificar se compila
3. `git add`, `git commit`, `git push`
4. `pnpm build && ./scripts/restart.sh` - recompilar e reiniciar

**NUNCA esquecer de recompilar após o push.**

## Versionamento (OBRIGATÓRIO)

**A cada atualização/commit, SEMPRE incrementar a versão.**

Arquivo centralizado: `packages/frontend/src/lib/version.ts`

```typescript
export const VERSION = {
  major: 0,
  minor: 0,
  patch: 15,
  stage: 'alpha', // 'alpha' | 'beta' | 'rc' | ''
}
```

### Regras de incremento:
- **patch**: Correções de bugs, pequenas melhorias (mais comum)
- **minor**: Novas funcionalidades
- **major**: Mudanças incompatíveis (breaking changes)
- **stage**: `alpha` → `beta` → `rc` → release (sem stage)

### Exibição:
A versão é exibida automaticamente no rodapé do frontend.

### Fluxo completo com versionamento:
1. Fazer as alterações
2. **Incrementar versão** em `packages/frontend/src/lib/version.ts`
3. `pnpm build` - verificar se compila
4. `git add`, `git commit`, `git push`
5. `pnpm build && ./scripts/restart.sh` - recompilar e reiniciar

**NUNCA fazer commit sem incrementar a versão.**

## Funcionalidades Implementadas

### Página de Settings
- Seleção de idioma (PT-BR / EN)
- Status da autenticação Claude Code
- Configuração de SSH/GitHub
- Status do sistema (Docker, Redis, SSH)
- Botão de diagnóstico completo
- Configurações do servidor

### Sistema de Diagnósticos
Verifica e mostra instruções de correção para:
- Docker daemon
- Grupo Docker
- Imagens Docker necessárias
- Containers órfãos
- Redis (opcional)
- Chaves SSH
- Portas de rede (3000, 8000)
- Espaço em disco

### Criação de Containers
- Formulário com validação
- Normalização de URLs do GitHub
- Suporte a clone de repositório
- Limites de recursos configuráveis
- Animação de loading com dots

## Arquivos de Configuração Claude Code

O sistema detecta automaticamente:
- `~/.claude/.credentials.json` - Credenciais de autenticação
- `~/.claude/commands/` - Skills/comandos (contados recursivamente)
- `~/.claude/agents/` - Agentes (contados recursivamente)
- `~/.claude/rules/` - Regras (contadas recursivamente)

## Terminal Interativo (v0.0.29+)

### Arquitetura

O terminal usa WebSocket com xterm.js para shell interativo dentro dos containers:

```
Frontend (xterm.js) <--WebSocket--> Backend (Socket.io) <--Docker Exec--> Container (/bin/bash)
```

### Componentes

| Arquivo | Propósito |
|---------|-----------|
| `frontend/components/interactive-terminal.tsx` | Componente xterm.js com WebSocket |
| `backend/services/terminal.service.ts` | Gerenciamento de sessões Docker exec |
| `backend/services/websocket.service.ts` | Namespace `/terminal` |
| `shared/types/terminal.types.ts` | Tipos TypeScript |

### Eventos WebSocket

| Evento | Direção | Propósito |
|--------|---------|-----------|
| `terminal:connect` | Client→Server | Iniciar sessão (containerId, cols, rows) |
| `terminal:input` | Client→Server | Enviar input (base64) |
| `terminal:resize` | Client→Server | Redimensionar terminal |
| `terminal:disconnect` | Client→Server | Encerrar sessão |
| `terminal:data` | Server→Client | Output do container (base64) |
| `terminal:close` | Server→Client | Sessão encerrada |
| `terminal:error` | Server→Client | Erro na sessão |

### Configurações

- **Timeout de inatividade**: 15 minutos
- **Máximo de sessões por container**: 5
- **Shell padrão**: `/bin/bash`
- **Encoding**: Base64 para dados binários

## Sistema de WebSocket (v0.0.24+)

### Arquitetura

O backend usa Socket.io com namespaces separados para diferentes funcionalidades:

| Namespace | Propósito | Eventos |
|-----------|-----------|---------|
| `/metrics` | Métricas em tempo real | `subscribe:container`, `container:metrics` |
| `/tasks` | Progresso de tarefas | `task:subscribe`, `task:event` |
| `/queue` | Fila de instruções | `instruction:*` |
| `/logs` | Logs do container | `log` |
| `/creation` | Progresso de criação | `container:creation:progress` |
| `/terminal` | Terminal interativo | `terminal:*` |

### Inicialização

O WebSocket é inicializado em `websocket.service.ts` e chamado no `index.ts`:

```typescript
// packages/backend/src/index.ts
import { initializeWebSocket } from './services/websocket.service'

// No startServer():
io = initializeWebSocket(httpServer)
```

### Métricas em Tempo Real

Quando um cliente se inscreve em um container:
1. Backend inicia coleta a cada 2 segundos
2. Métricas são emitidas via `container:metrics`
3. Coleta para quando último cliente desconecta

**Frontend:**
```typescript
// packages/frontend/src/hooks/use-metrics.ts
useMetrics(containerId) // Inscreve automaticamente se container running

// packages/frontend/src/lib/websocket.ts
metricsWsClient.connect()  // Conecta ao namespace /metrics
metricsWsClient.subscribeToContainer(containerId)
```

### Tipos Compartilhados

```typescript
// packages/shared/src/types/websocket.ts
export enum TaskEvent {
  CREATED = 'CREATED',
  UPDATED = 'UPDATED',
  PROGRESS = 'PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

// packages/shared/src/types/metrics.types.ts
export interface ContainerMetrics {
  containerId: string
  cpu: { usage: number; limit: number }
  memory: { usage: number; limit: number; percentage: number }
  disk: { usage: number; limit: number; percentage: number }
  network?: { rxBytes: number; txBytes: number }
  activeAgents: AgentProcess[]
}
```

## Rate Limiting (v0.0.24+)

Três níveis de rate limiting configuráveis via env:

| Tipo | Limite | Janela | Uso |
|------|--------|--------|-----|
| Standard | 100 req | 15 min | GET endpoints |
| Strict | 20 req | 15 min | POST/PUT/DELETE |
| Auth | 5 req | 1 min | Autenticação |

**Variáveis de ambiente:**
- `RATE_LIMIT_STANDARD` / `RATE_LIMIT_STANDARD_WINDOW_MS`
- `RATE_LIMIT_STRICT` / `RATE_LIMIT_STRICT_WINDOW_MS`
- `RATE_LIMIT_AUTH` / `RATE_LIMIT_AUTH_WINDOW_MS`

## CORS (v0.0.24+)

Origens permitidas configuráveis via `ALLOWED_ORIGINS`:

```bash
# Default (desenvolvimento)
http://localhost:3000,http://127.0.0.1:3000,http://localhost:8000,http://127.0.0.1:8000

# Produção (exemplo)
ALLOWED_ORIGINS=https://myapp.com,https://api.myapp.com
```

## Histórico de Versões

### v0.0.30-alpha
- Feat: Task de exclusão com progresso em tempo real via WebSocket
- Feat: TaskType `delete-container` no sistema de tarefas
- Fix: Terminal ASCII - codificação base64/UTF-8 corrigida (Uint8Array)
- Fix: Credenciais Claude - mount writeable para permitir refresh de tokens
- Fix: settings.json não é mais montado (copiado para permitir escrita)

### v0.0.29-alpha
- Feat: Terminal interativo via WebSocket + xterm.js
- Feat: Namespace `/terminal` para sessões shell
- Feat: Botão Shell na lista de containers navega para aba Terminal
- Fix: Removido polling automático - sistema 100% live via WebSocket
- Refactor: Removido `use-task-polling.ts` (não utilizado)

### v0.0.28-alpha
- Fix: Terminal não recarrega mais a cada 5 segundos
- Fix: Loading state apenas no primeiro fetch

### v0.0.27-alpha
- Feat: Aba Terminal na página de detalhes do container
- Fix: Botão Shell usa navegação em vez de API REST inexistente

### v0.0.26-alpha
- Fix: Integração correta do WebSocket com namespaces no index.ts
- Métricas em tempo real funcionando na lista de containers

### v0.0.25-alpha
- Fix: WebSocket client conectando na URL/namespace corretos
- Fix: Tipos ContainerMetrics (percentage vs percent)
- ContainerCard agora se inscreve em métricas quando running

### v0.0.24-alpha
- Feat: Sistema completo de WebSocket para tasks em tempo real
- Feat: TaskEvent types no shared package
- Feat: Namespace /tasks com subscriptions
- Feat: Hook useTaskWebSocket com reconnection e fallback
- Feat: Componente TaskProgress
- Feat: Rate limiting (standard/strict/auth)
- Feat: CORS com validação de origem
- 154 testes adicionados
