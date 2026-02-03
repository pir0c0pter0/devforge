# Claude Docker Web - Instruções

## Git Workflow (OBRIGATÓRIO)

### Após commit/push, SEMPRE recompilar e reiniciar

**Depois de fazer push, SEMPRE rodar:**

```bash
pnpm build
```

Isso garante que as mudanças apareçam no PC do usuário.

### Fluxo completo:

1. Fazer as alterações
2. `pnpm build` - verificar se compila
3. `git add`, `git commit`, `git push`
4. `pnpm build` - recompilar para aplicar mudanças

**NUNCA esquecer de recompilar após o push.**

## Versionamento (OBRIGATÓRIO)

**A cada atualização/commit, SEMPRE incrementar a versão.**

Arquivo centralizado: `packages/frontend/src/lib/version.ts`

```typescript
export const VERSION = {
  major: 0,
  minor: 0,
  patch: 1,
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
5. `pnpm build` - recompilar para aplicar mudanças

**NUNCA fazer commit sem incrementar a versão.**
