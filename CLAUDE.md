# DevForge - Instruções Críticas

## Versão Atual: 0.1.37-alpha

## Links

- **Repo**: https://github.com/pir0c0pter0/devforge
- **Issues**: https://github.com/pir0c0pter0/devforge/issues

---

## REGRAS CRÍTICAS

### 1. Telegram: SEMPRE usar Claude CLI, NUNCA API

**OBRIGATÓRIO**: Telegram DEVE usar Claude Code CLI local (`claude` command).

```
NÃO usar:
- ANTHROPIC_API_KEY
- anthropicService
- Chamadas diretas à API Anthropic

USAR:
- telegramClaudeService (telegram/services/claude-cli.service.ts)
- spawn('script', ['-q', '-c', 'claude ...', '/dev/null'])  # TTY emulation!
- --session-id e --resume para continuidade
```

**Detalhes técnicos importantes:**
- Claude CLI detecta non-TTY e bufferiza stdout indefinidamente
- SOLUÇÃO: Usar `script -q -c 'comando' /dev/null` para emular TTY
- Output vem com ANSI codes → usar `stripAnsiCodes()` para limpar
- Timeout de 2min para Telegram, 5min para containers

**Arquivo**: `packages/backend/src/telegram/services/claude-cli.service.ts`

### 2. Git Workflow

```bash
# Fluxo OBRIGATÓRIO:
1. Fazer alterações
2. Incrementar versão em packages/frontend/src/lib/version.ts
3. pnpm build
4. git add && git commit && git push
5. pnpm build && ./scripts/restart.sh
```

**NUNCA:**
- Commit sem incrementar versão
- Push sem testar build
- Esquecer de reiniciar após push

### 3. Tasks com Progress Granular

```typescript
// ❌ ERRADO
taskService.setProgress(taskId, 10, 'Verificando...');
await operacao();
taskService.setProgress(taskId, 90, 'Fim');

// ✅ CORRETO - mínimo 10 steps
taskService.setProgress(taskId, 5, 'Validando...');
taskService.setProgress(taskId, 10, 'Carregando...');
taskService.setProgress(taskId, 20, 'Conectando...');
// ... mais steps ...
taskService.complete(taskId, result);
```

### 4. Error Handling em Tasks

**SEMPRE chamar `taskService.fail()` em DOIS lugares:**
- No catch da rota (fire-and-forget)
- No catch do service

---

## Estrutura do Projeto

```
devforge/
├── packages/
│   ├── frontend/     # Next.js 15 (porta 3000)
│   ├── backend/      # Express + Dockerode (porta 8000)
│   └── shared/       # Tipos compartilhados
├── scripts/          # install.sh, start.sh, stop.sh, restart.sh, status.sh
└── docker/           # Dockerfiles para containers
```

## Scripts

```bash
./scripts/install.sh   # Instalação com systemd
./scripts/start.sh     # Iniciar
./scripts/stop.sh      # Parar
./scripts/restart.sh   # Reiniciar
./scripts/status.sh    # Status
./scripts/logs.sh      # Logs
```

## Dependências

- Node.js >= 18, pnpm >= 8, Docker, Redis/Valkey

---

## WebSocket Namespaces

| Namespace | Propósito |
|-----------|-----------|
| `/metrics` | Métricas em tempo real |
| `/tasks` | Progresso de tarefas |
| `/queue` | Fila de instruções |
| `/terminal` | Terminal interativo |
| `/docker-logs` | Logs de containers em tempo real |
| `/claude-daemon` | Eventos do Claude Code |

---

## Versionamento

Arquivo: `packages/frontend/src/lib/version.ts`

- **patch**: Correções (mais comum)
- **minor**: Novas funcionalidades
- **major**: Breaking changes

---

## Histórico Recente

### v0.1.37-alpha
- Feat: Nova paleta de cores alinhada ao logo DevForge
- Feat: Ciano (#22d3ee) substitui verde terminal como cor primária (chama do logo)
- Feat: Emerald (#10b981) agora usado apenas para status success
- Feat: Warning (#fbbf24) e Danger (#f97316) com WCAG AAA compliance
- Feat: Violet (#a78bfa) como accent para contexto Claude/IA
- Refactor: 29+ componentes CSS atualizados para nova paleta
- UX: Glows, hovers e focus states agora usam ciano da chama do logo
- A11y: Contraste melhorado para acessibilidade (9.4:1 no ciano)

### v0.1.36-alpha
- Feat: Licenca alterada de MIT para PolyForm Noncommercial 1.0.0
- Feat: COMMERCIAL-LICENSE.md com tiers Starter ($19), Pro ($99) e Enterprise
- Feat: CONTRIBUTING.md com CLA para dual licensing
- Feat: README atualizado com badge e secao de licenca
- Feat: FAQ bilingue (EN/PT-BR) no COMMERCIAL-LICENSE.md

### v0.1.35-alpha
- Feat: VSCodeHealthService extraído para serviço dedicado (elimina código duplicado)
- Feat: Endpoint GET /api/containers/:id/vscode-health para health check real
- Feat: Frontend usa health check real em vez de timer fixo de 30s (reduz para 3-15s)
- Feat: Tipos compartilhados VSCodeHealthResponse, VSCodeBootstrapStage no shared package
- Feat: Constantes centralizadas em vscode.config.ts (VSCodeConfig, TaskProgressRanges)
- Security: VS Code agora requer autenticação por senha (auth: password)
- Security: Senha gerada automaticamente e salva em /workspace/.vscode-credentials
- Security: Senha NÃO é mais logada em plaintext (apenas path do arquivo)
- Fix: Memory leak no polling do frontend (AbortController para cancelar fetch)
- Refactor: container.service.ts usa vscodeHealthService em vez de lógica inline

### v0.1.34-alpha
- Fix: VS Code removido da aba Visão Geral (agora só aparece na aba IDE)
- Feat: Container só mostra 100% iniciado quando VS Code (code-server) está pronto
- Feat: Progress bar mostra status de inicialização do VS Code (35%-60%)
- Feat: waitForVSCodeReady() com polling de health check na porta 8080
- UX: Iniciar container agora aguarda VS Code, não apenas Docker

### v0.1.33-alpha
- Feat: Bolinha de notificação na aba Claude Code quando termina processamento em background
- Refactor: ProcessingState movido para Zustand store (persiste entre tab switches)
- Refactor: Notification state gerenciado globalmente via hasNotificationByContainer
- UX: Bolinha verde pulsante aparece quando Claude termina enquanto em outra aba
- UX: Notificação limpa automaticamente ao voltar para aba Claude Code

### v0.1.32-alpha
- Fix: Claude Code tab agora persiste estado "thinking" ao trocar de aba
- Fix: Alterado de conditional render para CSS hidden pattern (igual Terminal/IDE)
- Perf: ClaudeChat permanece montado, preservando WebSocket e estado de processamento

### v0.1.31-alpha
- Feat: Opções de Embedded Development na criação de containers
- Feat: Suporte STM32 (ARM GCC, OpenOCD, ST-Link, Cortex-Debug)
- Feat: Suporte ESP32 (PlatformIO IDE completo com ESP-IDF)
- Feat: Extensões VS Code pré-instaladas para desenvolvimento embarcado
- Feat: Checkboxes no formulário de criação para STM32/ESP32
- Feat: Aviso de tempo de criação maior quando opções embarcadas selecionadas

### v0.1.30-alpha
- Fix: VS Code agora persiste ao trocar de aba (não reinicia mais)
- Fix: Aumentado tempo de loading de 8s para 30s (tempo real de bootstrap)
- Feat: Mensagens progressivas durante loading ("Connecting...", "Loading extensions...", etc)
- Perf: Iframe permanece montado via CSS hidden (mesmo padrão do Terminal)

### v0.1.29-alpha
- Fix: Eliminadas conexões WebSocket duplicadas do ClaudeDaemon
- Fix: ClaudeChat agora usa instância única compartilhada entre abas
- Fix: IDE tab simplificada (VS Code puro, sem sidebar Claude)
- Fix: Adicionado connection registry com ref-counting em useClaudeDaemon
- Fix: Removidos 45 console.log verbosos (mantidos apenas errors/warnings)
- Feat: Headers de segurança (Permissions-Policy, X-Frame-Options, X-Content-Type-Options)
- Perf: Reduzido uso de recursos com deduplicação de sockets

### v0.1.28-alpha
- Fix: Corrigido erros 404 de vsda.js e vsda_bg.wasm no console do VS Code
- Fix: Criados arquivos stub para Visual Studio Debug Adapter (proprietário MS)
- Note: Requer rebuild da imagem Docker para aplicar

### v0.1.26-alpha
- Feat: Loading indicator enquanto VS Code carrega no iframe
- UX: Ícone do VS Code + "Carregando VS Code..." durante inicialização

### v0.1.25-alpha
- Fix: VS Code agora abre dentro do site (não em nova janela)
- Fix: Botão VS Code no card do container navega para aba IDE
- Fix: Aba IDE busca URL do VS Code automaticamente ao ser selecionada

### v0.1.24-alpha
- Fix: VS Code agora abre com o projeto carregado automaticamente (?folder=/workspace)
- Fix: Tema padrão alterado para "Default Dark Modern" (mais moderno)
- Fix: Corrigido inconsistência entre /workspace e /home/developer/workspace
- Fix: startup.sh agora inicia code-server no diretório correto (/workspace)

### v0.1.23-alpha
- Feat: Nova aba IDE com VS Code embarcado + Claude Code sidebar
- Feat: Claude sidebar ocultável com botão toggle
- Feat: Sidebar redimensionável via drag
- Feat: VS Code abre dentro do site, não em nova janela
- Feat: Suporte a C/C++ na detecção de projetos

### v0.1.22-alpha
- Feat: VS Code abre com tema escuro por padrão (configurado na imagem Docker)
- Feat: Detecção automática de linguagem do projeto (Node.js, TypeScript, Rust, Go, Python, etc.)
- Feat: Configuração automática de VS Code baseada no projeto clonado
- Feat: Extensões recomendadas criadas em .vscode/extensions.json
- Feat: Settings de formatação e linting configurados por linguagem

### v0.1.21-alpha
- Fix: Adicionado ExposedPorts no ContainerCreateOptions (Docker API best practice)
- Fix: Mensagem de erro melhorada para containers antigos sem mapeamento de porta VS Code
- Fix: Templates rust e go agora usam alocação dinâmica de portas (0) em vez de estáticas
- Fix: Containers criados antes do port mapping agora mostram instrução clara de recrear

### v0.1.20-alpha
- Fix: CPU e memória agora zeram na lista de containers ao parar container
- Fix: Uso do disco não mostra mais valor errado brevemente ao carregar página
- Fix: Backend retornava disk como percentual (API), mas frontend esperava GB
- Fix: Formato de métricas agora consistente entre API REST e WebSocket

### v0.1.19-alpha
- Fix: Histórico de sessões agora mostra TODAS as conversas (não apenas a última)
- Fix: Frontend usava /messages?limit=500, perdendo sessões antigas
- Fix: Agora usa API dedicada /sessions que agrupa todas as mensagens
- Feat: Implementado endpoint /sessions/:sessionId para buscar mensagens de sessão específica
- Feat: Mensagens carregadas sob demanda ao selecionar sessão

### v0.1.18-alpha
- Fix: Timeout de instruções e melhorias de confiabilidade na fila
- Fix: Bloqueio de atualizações WebSocket durante troca de sessão

### v0.1.17-alpha
- Feat: Clicar em conversa histórica agora carrega mensagens na UI
- Feat: Contexto da conversa anterior é passado para o Claude na próxima mensagem
- Feat: Indicador visual quando há contexto pendente de sessão anterior
- Feat: Botão para limpar contexto pendente se usuário não quiser continuar conversa

### v0.1.16-alpha
- Feat: Botão de histórico de conversas no Claude Chat
- Feat: Migration 008 - tabela claude_sessions com agrupamento automático por gap de 30min
- Feat: SessionSelector dropdown para navegar entre conversas anteriores
- Feat: API REST: GET/POST /api/claude-daemon/:containerId/sessions
- Feat: ClaudeSessionsService para gerenciamento de sessões
- Feat: useClaudeSessions hook no frontend
- Feat: Tipos compartilhados ClaudeSession, ClaudeSessionMessage

### v0.1.15-alpha
- Fix: Gráfico de métricas agora carrega dados históricos corretamente
- Fix: Formato de data incompatível entre JavaScript ISO e SQLite DATETIME
- Fix: Conversão de `toISOString()` para formato SQLite (YYYY-MM-DD HH:MM:SS)
- Fix: Todas as queries de métricas agora usam formato de data correto

### v0.1.14-alpha
- Fix: Classificação de config dumps como build em vez de info

### v0.1.13-alpha
- Fix: UI mostra tipo do log (info, build, error) em vez de STDOUT/STDERR
- Fix: Classificador mais inteligente - stdout padrão agora é 'info'
- Fix: Runtime tab mostra apenas logs 'info' (informativos)
- Fix: Adicionados ~50 novos padrões de detecção para 'info'

### v0.1.12-alpha
- Feat: Docker logs smart collapse (agrupa logs similares consecutivos)
- Feat: Sub-tabs de logs: All | Build | Runtime | Errors
- Feat: Classificação automática de logs (build, runtime, error, warning, info)
- Feat: Badges de tipo de log com cores distintas
- Feat: Migration 007 para coluna log_type no SQLite
- Feat: API com filtros logType e logTypes

### v0.1.11-alpha
- Fix: Docker logs collection para containers com TTY habilitado
- Fix: Parser de logs raw (não-multiplexed) para containers interativos

### v0.1.10-alpha
- Fix: Inicialização do DockerLogsCollectorService no startup do backend
- Fix: Logs Docker agora são coletados em background 24/7

### v0.1.9-alpha
- Feat: Logs Docker persistentes com retenção de 24h
- Feat: Virtual scrolling para 100k+ linhas de logs
- Feat: Filtro por tempo (1h, 6h, 12h, 24h)
- Feat: Sanitização de secrets nos logs
- Feat: REST API para download de logs
- Feat: WebSocket namespace `/docker-logs` com batch mode

### v0.1.8-alpha
- Feat: Claude Code separado em aba independente

### v0.1.3-alpha
- Doc: CLAUDE.md resumido de 1184 para 147 linhas (pontos críticos)
- Doc: Detalhes técnicos do problema TTY/buffering do Telegram

### v0.1.2-alpha
- Fix: ANSI escape codes removidos do output Telegram
- Fix: Letras residuais (u, h, l) no final da resposta

### v0.1.1-alpha
- Fix: Isolamento de sessões Claude (Telegram vs Containers)
- Fix: Hard timeout 2min Telegram, 5min containers
- Fix: Processos pendurados mortos (SIGTERM → SIGKILL)

### v0.1.0-alpha
- Feat: Sistema de Conversação Claude no Telegram
- Feat: Histórico persistente SQLite
- Feat: Comandos /clear, /exit, /mode
- Feat: Rate limiting (10 msg/min)

### v0.0.85-alpha
- Feat: Histórico de chat Claude persistente no SQLite
