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

## Versionamento

Arquivo centralizado: `packages/frontend/src/lib/version.ts`

Para atualizar versão, editar:
```typescript
export const VERSION = {
  major: 0,
  minor: 0,
  patch: 1,
  stage: 'alpha', // 'alpha' | 'beta' | 'rc' | ''
}
```

Progressão: `alpha` → `beta` → `rc` → release (sem stage)
