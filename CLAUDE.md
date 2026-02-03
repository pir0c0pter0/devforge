# Claude Docker Web - Instruções

## Versão Atual: 0.0.15-alpha

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
