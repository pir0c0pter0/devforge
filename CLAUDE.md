# Claude Docker Web - Instruções

## Versão Atual: 0.0.58-alpha

## Estrutura do Projeto

```
claude-docker/
├── packages/
│   ├── frontend/     # Next.js 15 (porta 3000)
│   ├── backend/      # Express + Dockerode (porta 8000)
│   └── shared/       # Tipos compartilhados
├── scripts/          # Scripts de gerenciamento
│   ├── install.sh    # Instalação completa com systemd
│   ├── uninstall.sh  # Remover serviços systemd
│   ├── start.sh      # Iniciar serviços
│   ├── stop.sh       # Parar serviços
│   ├── restart.sh    # Reiniciar serviços
│   ├── status.sh     # Ver status
│   ├── logs.sh       # Ver logs
│   └── diagnose.sh   # Diagnóstico do sistema
└── docker/           # Dockerfiles para containers
```

## Instalação

### Instalação Rápida (Recomendado)

```bash
# Clone o repositório
git clone https://github.com/MarioJuniorPro/claude-docker.git
cd claude-docker

# Execute a instalação completa
./scripts/install.sh

# Comandos sudo necessários (solicitados pelo script):
sudo systemctl enable valkey   # ou redis
sudo systemctl start valkey
sudo loginctl enable-linger $USER
```

O script `install.sh` faz automaticamente:
1. Verifica dependências (Node.js, pnpm, Docker, Redis/Valkey)
2. Instala dependências do projeto (`pnpm install`)
3. Configura o `.env` do backend (porta 8000)
4. Compila o projeto (`pnpm build`)
5. Cria serviços systemd para backend e frontend
6. Habilita auto-start no boot
7. Inicia os serviços
8. Mostra comandos sudo necessários

### Dependências

- **Node.js** >= 18
- **pnpm** >= 8
- **Docker** com acesso ao socket
- **Redis** ou **Valkey** (fork do Redis)

## Scripts de Gerenciamento

```bash
# Instalação completa com serviços systemd
./scripts/install.sh

# Desinstalar serviços systemd
./scripts/uninstall.sh

# Iniciar serviços (usa systemd se instalado)
./scripts/start.sh

# Parar serviços
./scripts/stop.sh

# Reiniciar serviços
./scripts/restart.sh

# Ver status completo (serviços + systemd + linger)
./scripts/status.sh

# Ver logs
./scripts/logs.sh

# Executar diagnóstico do sistema
./scripts/diagnose.sh
```

### Serviços Systemd

Após a instalação, dois serviços são criados:

| Serviço | Descrição | Porta |
|---------|-----------|-------|
| `claude-docker-backend` | API Express + WebSocket | 8000 |
| `claude-docker-frontend` | Next.js | 3000 |

**Comandos úteis:**

```bash
# Ver status dos serviços
systemctl --user status claude-docker-backend
systemctl --user status claude-docker-frontend

# Ver logs em tempo real
journalctl --user -u claude-docker-backend -f
journalctl --user -u claude-docker-frontend -f

# Reiniciar um serviço específico
systemctl --user restart claude-docker-backend
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

### Fila de Instruções (Claude Daemon)
- `GET /api/claude-daemon/:containerId/queue` - Status da fila
- `GET /api/claude-daemon/:containerId/queue/history` - Histórico de jobs
- `GET /api/claude-daemon/:containerId/queue/dlq` - Dead Letter Queue
- `GET /api/claude-daemon/:containerId/queue/jobs/:jobId` - Detalhes do job
- `POST /api/claude-daemon/:containerId/queue/jobs/:jobId/cancel` - Cancelar job
- `POST /api/claude-daemon/:containerId/queue/jobs/:jobId/retry` - Retentar job
- `DELETE /api/claude-daemon/:containerId/queue` - Limpar fila
- `POST /api/claude-daemon/:containerId/queue/pause` - Pausar fila
- `POST /api/claude-daemon/:containerId/queue/resume` - Resumir fila
- `POST /api/claude-daemon/:containerId/instruction` - Adicionar instrução

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
| `/queue` | Fila de instruções em tempo real | `instruction:pending`, `instruction:started`, `instruction:completed`, `instruction:failed` |
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

### Fila de Instruções em Tempo Real (v0.0.57+)

O componente `InstructionQueue` se inscreve no namespace `/queue` para atualizações em tempo real:

```typescript
// packages/frontend/src/components/instruction-queue.tsx
const socket = io(`${WS_URL}/queue`, { transports: ['websocket', 'polling'] })

socket.on('connect', () => {
  socket.emit('subscribe:container', containerId)
})

// Eventos que disparam refresh da fila
socket.on('instruction:pending', () => fetchQueue())
socket.on('instruction:started', () => fetchQueue())
socket.on('instruction:completed', () => fetchQueue())
socket.on('instruction:failed', () => fetchQueue())
```

**Parser de Resposta do Claude:**

O componente parseia o JSON stream do Claude para exibir a resposta de forma limpa:

```typescript
// Extrai texto da resposta, custo e duração
const parseClaudeOutput = (stdout: string) => {
  // Procura por type: 'result' ou type: 'assistant'
  // Extrai: result (texto), total_cost_usd, duration_ms
  return { text, cost, duration }
}
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

## Sistema de Tasks (OBRIGATÓRIO) - Documentação Completa

O sistema de tasks gerencia operações assíncronas de longa duração com feedback em tempo real via WebSocket.

### Arquitetura

```
┌─────────────────┐     HTTP 202 + taskId      ┌─────────────────┐
│    Frontend     │◄──────────────────────────►│     Backend     │
│   (Next.js)     │                            │    (Express)    │
└────────┬────────┘                            └────────┬────────┘
         │                                              │
         │  WebSocket /tasks                            │
         │  ┌────────────────────┐                      │
         └──┤ task:subscribe     │◄─────────────────────┤
            │ task:event         │  emitTaskEvent()     │
            └────────────────────┘                      │
                                                        │
                                               ┌────────┴────────┐
                                               │  TaskService    │
                                               │  (In-Memory)    │
                                               └─────────────────┘
```

### Arquivos do Sistema

| Arquivo | Propósito |
|---------|-----------|
| `backend/services/task.service.ts` | Gerenciamento de tasks (create, update, complete, fail) |
| `backend/services/websocket.service.ts` | Namespace `/tasks` e emissão de eventos |
| `frontend/hooks/use-task-websocket.ts` | Hook React para subscriptions |
| `frontend/components/container-card.tsx` | Exemplo de uso do hook |
| `shared/types/task.types.ts` | Tipos TypeScript compartilhados |
| `shared/types/events.types.ts` | Enum TaskEvent e payloads |

### Tipos TypeScript (shared)

```typescript
// packages/shared/src/types/task.types.ts
export type TaskType =
  | 'create-container'
  | 'start-container'
  | 'delete-container'
  | 'clone-repo'
  | 'generic';

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface Task {
  id: string;
  type: TaskType;
  status: TaskStatus;
  progress: number;        // 0-100
  message: string;         // Mensagem atual para o usuário
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  result?: unknown;        // Resultado em caso de sucesso
  error?: string;          // Mensagem de erro em caso de falha
}

// packages/shared/src/types/events.types.ts
export enum TaskEvent {
  CREATED = 'CREATED',
  UPDATED = 'UPDATED',
  PROGRESS = 'PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export interface TaskEventPayload {
  event: TaskEvent;
  task: Task;
  timestamp: Date;
  meta?: {
    previousStatus?: TaskStatus;
    errorDetails?: string;
  };
}
```

### API de Tasks

```typescript
// packages/backend/src/services/task.service.ts

// Criar nova task
const task = taskService.create('start-container');
// → { id: 'uuid', type: 'start-container', status: 'pending', progress: 0 }

// Iniciar task
taskService.start(taskId, 'Iniciando operação...');
// → status: 'running', emite TaskEvent.UPDATED

// Atualizar progresso (OBRIGATÓRIO: muitas vezes por operação!)
taskService.setProgress(taskId, 30, 'Conectando ao Docker...');
// → emite TaskEvent.PROGRESS

// Completar com sucesso
taskService.complete(taskId, { containerId: 'xxx' });
// → status: 'completed', progress: 100, emite TaskEvent.COMPLETED

// Falhar com erro
taskService.fail(taskId, 'Erro: container não encontrado');
// → status: 'failed', emite TaskEvent.FAILED

// Buscar task
const task = taskService.get(taskId);
```

### WebSocket Events

| Evento | Direção | Payload | Descrição |
|--------|---------|---------|-----------|
| `task:subscribe` | Client→Server | `{ taskId: string }` | Subscrever a uma task |
| `task:unsubscribe` | Client→Server | `{ taskId: string }` | Cancelar subscrição |
| `task:subscribe:batch` | Client→Server | `{ taskIds: string[] }` | Subscrever a várias tasks |
| `task:event` | Server→Client | `TaskEventPayload` | Atualização de task |

### Frontend Hook (use-task-websocket)

```typescript
// packages/frontend/src/hooks/use-task-websocket.ts

const {
  task,           // Task atual (single subscription)
  tasks,          // Map de tasks (batch subscription)
  isConnected,    // WebSocket conectado?
  isUsingFallback,// Usando HTTP polling?
  subscribe,      // Subscrever a uma task
  unsubscribe,    // Cancelar subscrição
  subscribeBatch, // Subscrever a várias tasks
  reset,          // Resetar estado
} = useTaskWebSocket({
  onComplete: (task) => { /* task completou */ },
  onError: (task) => { /* task falhou */ },
  onUpdate: (payload) => { /* qualquer atualização */ },
  enableFallback: true,  // HTTP polling se WebSocket falhar
});

// Uso típico
useEffect(() => {
  if (taskId) {
    subscribe(taskId);
  }
  return () => unsubscribe();
}, [taskId]);
```

### Como Criar Nova Operação com Task

#### 1. Adicionar TaskType (se necessário)

```typescript
// packages/shared/src/types/task.types.ts
export type TaskType =
  | 'create-container'
  | 'start-container'
  | 'delete-container'
  | 'nova-operacao'  // ← Adicionar aqui
  | 'generic';
```

#### 2. Criar Endpoint na API

```typescript
// packages/backend/src/api/routes/exemplo.routes.ts
router.post('/:id/nova-operacao', async (req, res) => {
  const { id } = req.params;

  // 1. Criar task
  const task = taskService.create('nova-operacao');

  // 2. Iniciar task
  taskService.start(task.id, 'Iniciando operação...');

  // 3. Executar operação ASYNC (não bloquear response)
  meuService.executarOperacao(id, task.id)
    .then((result) => {
      logger.info({ id, taskId: task.id }, 'Operação concluída');
    })
    .catch((error) => {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ error, taskId: task.id }, 'Operação falhou');
      taskService.fail(task.id, errorMessage);  // ← OBRIGATÓRIO!
    });

  // 4. Retornar imediatamente com taskId
  res.status(202).json({
    success: true,
    data: { taskId: task.id },
    message: 'Operação iniciada'
  });
});
```

#### 3. Implementar Operação com Progress Granular

```typescript
// packages/backend/src/services/meu.service.ts
async executarOperacao(id: string, taskId: string): Promise<Result> {
  try {
    // OBRIGATÓRIO: Progress granular (mínimo 10 steps)
    taskService.setProgress(taskId, 5, 'Validando permissões...');
    await this.validarPermissoes(id);

    taskService.setProgress(taskId, 10, 'Carregando configuração...');
    const config = await this.carregarConfig(id);

    taskService.setProgress(taskId, 20, 'Preparando recursos...');
    taskService.setProgress(taskId, 25, 'Conectando ao serviço...');

    taskService.setProgress(taskId, 30, 'Executando operação principal...');
    taskService.setProgress(taskId, 35, 'Aguardando resposta...');
    const resultado = await this.operacaoPrincipal(config);

    taskService.setProgress(taskId, 60, 'Operação concluída!');
    taskService.setProgress(taskId, 70, 'Validando resultado...');

    taskService.setProgress(taskId, 80, 'Atualizando banco de dados...');
    await this.salvarResultado(resultado);

    taskService.setProgress(taskId, 90, 'Limpando recursos temporários...');
    taskService.setProgress(taskId, 95, 'Finalizando...');

    // OBRIGATÓRIO: Completar a task
    taskService.complete(taskId, { id, resultado });

    return resultado;
  } catch (error) {
    // OBRIGATÓRIO: Falhar a task em caso de erro
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    taskService.fail(taskId, errorMessage);
    throw error;
  }
}
```

#### 4. Usar no Frontend

```typescript
// packages/frontend/src/components/meu-componente.tsx
function MeuComponente({ id }: Props) {
  const [taskId, setTaskId] = useState<string | null>(null);

  const handleComplete = useCallback((task: Task) => {
    console.log('Operação concluída:', task.result);
    setTaskId(null);
  }, []);

  const handleError = useCallback((task: Task) => {
    console.error('Operação falhou:', task.error);
    setTaskId(null);
  }, []);

  const { task, subscribe, unsubscribe } = useTaskWebSocket({
    onComplete: handleComplete,
    onError: handleError,
  });

  // Subscrever quando tiver taskId
  useEffect(() => {
    if (taskId) {
      subscribe(taskId);
    }
    return () => unsubscribe();
  }, [taskId, subscribe, unsubscribe]);

  const handleClick = async () => {
    const response = await apiClient.novaOperacao(id);
    if (response.success && response.data?.taskId) {
      setTaskId(response.data.taskId);
    }
  };

  return (
    <div>
      <button onClick={handleClick} disabled={!!taskId}>
        {taskId ? 'Executando...' : 'Executar'}
      </button>

      {task && (
        <div>
          <progress value={task.progress} max={100} />
          <span>{task.progress}% - {task.message}</span>
        </div>
      )}
    </div>
  );
}
```

---

## Regras OBRIGATÓRIAS para Tasks

### 1. Progress Granular (OBRIGATÓRIO)

**SEMPRE usar progress granular em operações async.** Operações rápidas (~100ms) parecem "travadas" se o progress pula muito.

#### ❌ ERRADO - Progress com gaps grandes
```typescript
taskService.setProgress(taskId, 10, 'Verificando...');
await dockerService.startContainer(dockerId); // Usuário vê 10% por 100ms
taskService.setProgress(taskId, 90, 'Finalizando...');
```

#### ✅ CORRETO - Progress granular
```typescript
taskService.setProgress(taskId, 5, 'Verificando permissões...');
taskService.setProgress(taskId, 10, 'Carregando configuração...');
taskService.setProgress(taskId, 20, 'Conectando ao Docker...');
taskService.setProgress(taskId, 30, 'Enviando comando...');
taskService.setProgress(taskId, 35, 'Iniciando container...');
await dockerService.startContainer(dockerId);
taskService.setProgress(taskId, 60, 'Container iniciado!');
taskService.setProgress(taskId, 70, 'Verificando saúde...');
taskService.setProgress(taskId, 80, 'Atualizando banco...');
taskService.setProgress(taskId, 90, 'Finalizando...');
taskService.complete(taskId, result);
```

### 2. Mínimo de Steps por Operação

| Operação | Mínimo Steps | Gap Máximo |
|----------|-------------|------------|
| CREATE | 15+ steps | 10% |
| START | 10+ steps | 15% |
| DELETE | 12+ steps | 15% |
| STOP | 6+ steps | 20% |
| Nova operação | 10+ steps | 15% |

### 3. Error Handling (OBRIGATÓRIO)

**SEMPRE chamar `taskService.fail()` em DOIS lugares:**

#### No catch block da rota (fire-and-forget):
```typescript
meuService.operacao(id, task.id)
  .catch((error) => {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error }, 'Failed');
    taskService.fail(task.id, errorMessage);  // ← OBRIGATÓRIO!
  });
```

#### No catch block do service:
```typescript
async operacao(id: string, taskId: string) {
  try {
    // ... operação
    taskService.complete(taskId, result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    taskService.fail(taskId, errorMessage);  // ← OBRIGATÓRIO!
    throw error;
  }
}
```

### 4. Cleanup em Caso de Erro

Quando operação falha, **DELETAR** registros parciais:

```typescript
// Em caso de falha:
if (containerId) {
  containerRepository.delete(containerId);  // ✅ Permite retry
  // NÃO: containerRepository.updateStatus(containerId, 'error'); // ❌ Bloqueia
}
```

### 5. Verificação de Status Antes de Operações

```typescript
const existing = repository.findByName(name);
if (existing) {
  if (existing.status === 'error') {
    repository.delete(existing.id);  // Limpar registro com erro
  } else if (existing.status === 'creating' || existing.status === 'deleting') {
    return error('Operação em andamento. Aguarde.');
  } else {
    return error('Recurso já existe');
  }
}
```

### 6. Mensagens em Português

Todas as mensagens de progress devem ser em português:

```typescript
// ✅ CORRETO
taskService.setProgress(taskId, 30, 'Iniciando container no Docker...');
taskService.setProgress(taskId, 60, 'Container iniciado com sucesso!');
taskService.fail(taskId, 'Falha ao iniciar container: timeout');

// ❌ ERRADO
taskService.setProgress(taskId, 30, 'Starting container...');
```

### 7. Timeout de Tasks

Tasks são automaticamente limpas após 1 hora pelo `TaskService`.
Não é necessário implementar timeout manual.

## Sistema de Internacionalização (i18n) (v0.0.50+)

### Arquitetura

O sistema de tradução usa React Context para gerenciar o idioma:

```
translations.ts → I18nProvider → useI18n() hook → Componentes
```

### Arquivos

| Arquivo | Propósito |
|---------|-----------|
| `frontend/src/lib/i18n/translations.ts` | Todas as traduções PT-BR e EN |
| `frontend/src/lib/i18n/context.tsx` | Provider e hook useI18n |
| `frontend/src/lib/i18n/index.ts` | Exports |

### Uso em Componentes

```typescript
import { useI18n } from '@/lib/i18n'

function MeuComponente() {
  const { t, language, setLanguage } = useI18n()

  return (
    <div>
      <h1>{t.containerDetail.tabs.overview}</h1>
      <button onClick={() => setLanguage('en')}>
        {t.settings.language.english}
      </button>
    </div>
  )
}
```

### Estrutura das Traduções

```typescript
const translations = {
  'pt-BR': {
    nav: { dashboard: 'Painel', ... },
    container: { start: 'Iniciar', stop: 'Parar', ... },
    containerDetail: {
      tabs: { overview: 'Visão Geral', metrics: 'Métricas', ... },
      ...
    },
    ...
  },
  'en': {
    nav: { dashboard: 'Dashboard', ... },
    container: { start: 'Start', stop: 'Stop', ... },
    ...
  }
}
```

### Idiomas Suportados

- **pt-BR**: Português (Brasil) - padrão
- **en**: English

### Adicionando Novas Traduções

1. Adicionar chave em `translations['pt-BR']`
2. Adicionar mesma chave em `translations['en']`
3. Usar no componente: `t.minhaSecao.minhaChave`

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

### v0.0.58-alpha
- Feat: **Scripts de instalação com serviços systemd**
- Feat: `install.sh` - Instalação completa automatizada
- Feat: `uninstall.sh` - Remover serviços systemd
- Feat: Serviços `claude-docker-backend` e `claude-docker-frontend` para systemd
- Feat: Auto-start no boot via `loginctl enable-linger`
- Feat: Scripts `start.sh`, `stop.sh`, `restart.sh` agora usam systemd se disponível
- Feat: `status.sh` mostra status do systemd, auto-start e linger
- Fix: Porta do backend corrigida para 8000 no `.env`
- Fix: EnvironmentFile para carregar variáveis do `.env` nos serviços

### v0.0.57-alpha
- Feat: **Fila de instruções com WebSocket em tempo real**
- Feat: Subscription automática ao namespace `/queue` para atualizações live
- Feat: Atualização automática quando jobs mudam de estado (pending→active→completed)
- Feat: Parser inteligente para extrair resposta limpa do Claude stream-json
- Feat: Exibe texto da resposta, custo ($) e duração da API de forma legível
- Feat: Fallback para JSON bruto se parsing falhar
- Fix: Não precisa mais dar F5 para ver resultado

### v0.0.56-alpha
- Fix: **Removido flag `--yes` inexistente** do Claude Code CLI
- Fix: `--dangerously-skip-permissions` já cobre modo autônomo
- Fix: Erro "unknown option '--yes'" corrigido

### v0.0.55-alpha
- Feat: **Captura de stdout/stderr do Claude para resultado do job**
- Feat: `sendInstruction` agora retorna Promise com output capturado
- Feat: Worker aguarda conclusão e salva output no resultado do job
- Feat: Clique na fila de instruções agora mostra resultado real
- Refactor: Arquitetura de `sendInstruction` alterada de fire-and-forget para Promise-based

### v0.0.54-alpha
- Fix: **Modo do container usado na fila** (não mais do frontend)
- Fix: Backend busca mode do `containerRepository` ao criar job
- Fix: Containers autônomos agora mostram "autônomo" na fila corretamente
- Fix: Parâmetro `mode` do frontend é ignorado (fonte da verdade é o backend)

### v0.0.53-alpha
- Feat: **Visualização de resultados** na fila de instruções (clique para expandir)
- Feat: Detalhes do job: instrução completa, stdout, stderr, exit code, duração
- Feat: Modo do container agora é consultado do repositório
- Feat: Tipo `JobDetails` e método `getJobDetails` no api-client
- Feat: Novas traduções: loadingDetails, fullInstruction, result, errorDetails

### v0.0.52-alpha
- Feat: **Indicador visual de "pensando"** no Claude Chat
- Feat: Feedback visual melhorado quando Claude está processando
- Feat: Animação pulsante com ícone do Bot e spinner
- Feat: Mensagem de subtexto "Processando sua instrução..."
- Fix: `isLoading` agora permanece ativo até Claude responder
- Fix: `instruction:received` não desativa mais o loading prematuramente
- Feat: Novas traduções: thinkingSubtext, placeholder, pressEnter

### v0.0.51-alpha
- Fix: **Volumes isolados por container** (corrige clone de repositórios)
- Fix: Cada container agora tem seu próprio volume de workspace nomeado
- Fix: Nome do volume: `claude-docker-{nome-container}-workspace`
- Fix: Volumes são deletados automaticamente quando container é excluído
- Fix: Método `deleteVolume` adicionado ao docker.service
- Fix: Clone de repositórios GitHub agora funciona corretamente

### v0.0.50-alpha
- Feat: **Sistema completo de traduções i18n**
- Feat: Traduções para sidebar (nav, signOut, manager)
- Feat: Traduções para container detail page (tabs, labels, buttons)
- Feat: Traduções para claude chat
- Feat: Traduções para templates page
- Feat: Atualizar sidebar.tsx para usar traduções
- Feat: Container detail page reescrita com todas as traduções
- Feat: Todos os textos agora suportam PT-BR e EN

### v0.0.49-alpha
- Fix: **Redis maxRetriesPerRequest null para BullMQ**
- Fix: Configuração Redis incompatível com BullMQ corrigida
- Fix: HTTP 500 na fila de instruções resolvido

### v0.0.48-alpha
- Fix: **Endpoint da fila de instruções corrigido**
- Fix: `/api/containers/:id/queue` → `/api/claude-daemon/:id/queue/history`
- Feat: Novos métodos API: getQueueStatus, cancelJob, retryJob
- Feat: Tipos QueueItem atualizados para compatibilidade com backend
- Feat: Traduções pt-BR e en para fila de instruções
- Feat: Status: waiting, active, completed, failed, delayed, dead-letter

### v0.0.47-alpha
- Feat: **Sistema de fila de comandos BullMQ consolidado**
- Feat: WebSocket events para ciclo de vida de instruções
- Feat: Dead Letter Queue para jobs que falharam
- Fix: HTTP 404 em `/api/queue` resolvido (consolidação de sistemas duplicados)
- Feat: Novos endpoints: history, dlq, cancel, retry, pause, resume
- Refactor: Removido código duplicado (~827 linhas)

### v0.0.46-alpha
- Fix: Melhorias de estabilidade no sistema de filas

### v0.0.45-alpha
- Fix: Correções de bugs menores

### v0.0.44-alpha
- Fix: Ajustes de interface

### v0.0.43-alpha
- Fix: Correções de compatibilidade

### v0.0.42-alpha
- Fix: **Tema escuro completo em todo o frontend**

### v0.0.41-alpha
- Fix: Input e sub-tabs do chat para tema escuro

### v0.0.40-alpha
- Fix: Cores do chat Claude Code para tema escuro

### v0.0.39-alpha
- Fix: **Working directory padronizado para `/workspace`** em todos os serviços
- Fix: Claude Daemon, Terminal, e Templates agora usam `/workspace` consistentemente
- Feat: Git configurado automaticamente após clone (user.email, user.name)
- Feat: Permissões do workspace ajustadas para usuário developer
- Feat: safe.directory configurado para evitar erros de ownership no git
- Fix: Repositório agora é reconhecido pelo Claude Code

### v0.0.38-alpha
- Fix: **Parsing de mensagens Claude** - conteúdo array agora tratado corretamente
- Fix: Claude retorna `content: [{type: "text", text: "..."}]` não string direta
- Feat: `extractTextContent()` função para parsear formato array do Claude
- Fix: React error #31 (Objects are not valid as React child) corrigido

### v0.0.37-alpha
- Fix: **Claude Code Daemon - arquitetura session-based** (corrige processo que parava)
- Feat: Cada instrução agora spawn um novo processo (não processo persistente)
- Feat: Sessões mantêm contexto via `--session-id` e `--resume`
- Feat: Flags corrigidas: `--print --verbose` necessárias para stream-json
- Feat: Session ID único (UUID) por container para manter histórico de conversa
- Fix: Claude Code 2.1.29 requer `--print` para `--input-format stream-json`

### v0.0.36-alpha
- Feat: **Indicadores visuais de status melhorados** com ícones animados
- Feat: Novo componente `StatusIndicator` com animações por status
- Feat: Running: engrenagem girando com pulse verde
- Feat: Stopped/Exited: ícone pause (amarelo para exited = precisa atenção)
- Feat: Creating/Restarting: spinner amarelo
- Feat: Error: exclamação vermelha com pulse
- Feat: Paused: triângulo de atenção amarelo
- Feat: Suporte a novos status: `exited`, `paused`, `restarting`
- Feat: Traduções atualizadas PT-BR e EN para novos status

### v0.0.35-alpha
- Fix: Claude Chat movido de aba principal para sub-aba dentro de Terminal
- Feat: Sub-tabs Shell/Claude Code na aba Terminal
- Fix: Navegação do botão Shell não atualizava activeTab quando já na página
- Fix: useEffect para sincronizar activeTab com searchParams da URL

### v0.0.34-alpha
- Feat: **Claude Code Daemon** - Interface web para Claude Code autônomo (Issue #5)
- Feat: Backend `claude-daemon.service.ts` para gerenciamento de daemons
- Feat: WebSocket namespace `/claude-daemon` para comunicação em tempo real
- Feat: REST API `/api/claude-daemon` para controle de daemons
- Feat: Hook `useClaudeDaemon` para frontend React
- Feat: Componentes `ClaudeChat`, `StatusBadge`, `MessageItem`
- Feat: Nova aba "Claude" na página de detalhes do container
- Feat: Suporte a instruções via WebSocket com streaming JSON
- Feat: Claude Code roda com `--dangerously-skip-permissions` em modo autônomo

### v0.0.33-alpha
- Fix: Credenciais Claude (.credentials.json) agora são copiadas via docker cp (além do mount)
- Fix: Dockerfiles criam arquivo .credentials.json vazio para evitar bug de bind mount
- Fix: Dockerfiles criam settings.json com tema dark por padrão
- Fix: Adicionadas pastas faltantes (plugins, get-shit-done, commands, hooks) nos Dockerfiles

### v0.0.32-alpha
- Feat: Progress granular em START (4→12 steps) e DELETE (6→15 steps)
- Feat: Mensagens descritivas em cada etapa do progress
- Doc: Adicionadas regras obrigatórias para Task System no CLAUDE.md

### v0.0.31-alpha
- Fix: `taskService.fail()` agora é chamado no catch block de criação
- Fix: Containers com erro são deletados (não apenas marcados como 'error')
- Fix: Verificação de nome considera status 'error' e 'creating'
- Fix: Permite reuso de nome após falha de criação

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
