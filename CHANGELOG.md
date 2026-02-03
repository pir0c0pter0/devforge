# Changelog

Todas as mudanças notáveis neste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adere ao [Semantic Versioning](https://semver.org/lang/pt-BR/).

## [0.0.29-alpha] - 2026-02-03

### Adicionado
- **Terminal Interativo**: Shell interativo dentro dos containers via WebSocket + xterm.js
- Namespace `/terminal` no WebSocket para gerenciamento de sessões
- Componente `InteractiveTerminal` com suporte a redimensionamento e reconexão
- Serviço `terminal.service.ts` para gerenciamento de sessões Docker exec
- Tipos compartilhados em `terminal.types.ts`
- Aba "Terminal" na página de detalhes do container

### Alterado
- Botão "Shell" na lista de containers agora navega para a aba Terminal
- Sistema 100% live - removido todo polling automático

### Removido
- Hook `use-task-polling.ts` (não estava em uso)
- Intervalos de polling em `containers/[id]/page.tsx` e `instruction-queue.tsx`

## [0.0.28-alpha] - 2026-02-03

### Corrigido
- Terminal não recarrega mais a cada 5 segundos
- Loading state apenas no primeiro fetch da página de container

## [0.0.27-alpha] - 2026-02-03

### Adicionado
- Aba Terminal na página de detalhes do container
- Suporte a query parameter `?tab=terminal` para navegação direta

### Corrigido
- Botão Shell usa navegação em vez de chamar API REST inexistente

## [0.0.26-alpha] - 2026-02-03

### Corrigido
- Integração correta do WebSocket com namespaces no `index.ts`
- Métricas em tempo real funcionando na lista de containers

## [0.0.25-alpha] - 2026-02-03

### Corrigido
- WebSocket client conectando na URL/namespace corretos
- Tipos `ContainerMetrics` (percentage vs percent)
- ContainerCard agora se inscreve em métricas quando running

## [0.0.24-alpha] - 2026-02-02

### Adicionado
- Sistema completo de WebSocket para tasks em tempo real
- `TaskEvent` types no shared package
- Namespace `/tasks` com subscriptions
- Hook `useTaskWebSocket` com reconnection e fallback
- Componente `TaskProgress`
- Rate limiting (standard/strict/auth)
- CORS com validação de origem

## [0.0.23-alpha] - 2026-02-02

### Adicionado
- Sistema de tarefas (job queue) para operações assíncronas
- Container aparece imediatamente na lista durante criação
- Barra de progresso durante start do container

## [0.0.22-alpha] - 2026-02-02

### Adicionado
- Soft limit de disco com alertas visuais e logs
- Melhorias na UX de criação de containers

## [0.0.21-alpha] - 2026-02-01

### Corrigido
- Correção no cálculo de uso de disco

---

## Tipos de Mudanças

- **Adicionado** para novas funcionalidades
- **Alterado** para mudanças em funcionalidades existentes
- **Obsoleto** para funcionalidades que serão removidas em breve
- **Removido** para funcionalidades removidas
- **Corrigido** para correção de bugs
- **Segurança** para vulnerabilidades corrigidas
