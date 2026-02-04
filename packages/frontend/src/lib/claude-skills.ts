// Lista de skills disponíveis no Claude Code
// Baseada nos skills instalados no sistema

export interface ClaudeSkill {
  name: string
  description: string
  category: 'workflow' | 'testing' | 'code' | 'docs' | 'gsd' | 'other'
}

export const CLAUDE_SKILLS: ClaudeSkill[] = [
  // Workflow
  { name: '/plan', description: 'Criar plano de implementação', category: 'workflow' },
  { name: '/learn', description: 'Extrair padrões reutilizáveis', category: 'workflow' },
  { name: '/multi-perspective', description: 'Análise com 5 agentes em paralelo', category: 'workflow' },

  // Testing
  { name: '/tdd', description: 'Workflow TDD: testes primeiro', category: 'testing' },
  { name: '/tdd-workflow', description: 'TDD completo com 80%+ cobertura', category: 'testing' },
  { name: '/e2e', description: 'Testes E2E com Playwright', category: 'testing' },
  { name: '/test-coverage', description: 'Verificar cobertura de testes', category: 'testing' },

  // Code
  { name: '/code-review', description: 'Revisão de código', category: 'code' },
  { name: '/security-review', description: 'Revisão de segurança', category: 'code' },
  { name: '/build-fix', description: 'Corrigir erros de build', category: 'code' },
  { name: '/refactor-clean', description: 'Limpar código morto', category: 'code' },

  // Documentation
  { name: '/update-docs', description: 'Atualizar documentação', category: 'docs' },
  { name: '/update-codemaps', description: 'Atualizar codemaps', category: 'docs' },

  // GSD (Get Stuff Done)
  { name: '/gsd:help', description: 'Ajuda do GSD', category: 'gsd' },
  { name: '/gsd:progress', description: 'Ver progresso do projeto', category: 'gsd' },
  { name: '/gsd:new-project', description: 'Iniciar novo projeto', category: 'gsd' },
  { name: '/gsd:new-milestone', description: 'Novo milestone', category: 'gsd' },
  { name: '/gsd:plan-phase', description: 'Planejar uma fase', category: 'gsd' },
  { name: '/gsd:execute-phase', description: 'Executar uma fase', category: 'gsd' },
  { name: '/gsd:debug', description: 'Debug sistemático', category: 'gsd' },
  { name: '/gsd:verify-work', description: 'Validar trabalho feito', category: 'gsd' },
  { name: '/gsd:quick', description: 'Tarefa rápida com garantias GSD', category: 'gsd' },
  { name: '/gsd:add-todo', description: 'Adicionar tarefa à lista', category: 'gsd' },
  { name: '/gsd:check-todos', description: 'Listar tarefas pendentes', category: 'gsd' },
  { name: '/gsd:settings', description: 'Configurações do GSD', category: 'gsd' },

  // Other
  { name: '/keybindings-help', description: 'Ajuda com atalhos de teclado', category: 'other' },
]

export const SKILL_CATEGORIES = {
  workflow: { label: 'Workflow', color: 'text-terminal-cyan' },
  testing: { label: 'Testing', color: 'text-terminal-green' },
  code: { label: 'Code', color: 'text-terminal-yellow' },
  docs: { label: 'Docs', color: 'text-terminal-purple' },
  gsd: { label: 'GSD', color: 'text-orange-400' },
  other: { label: 'Other', color: 'text-terminal-textMuted' },
} as const

// Filtrar skills por termo de busca
export function filterSkills(query: string): ClaudeSkill[] {
  const searchTerm = query.toLowerCase().replace(/^\//, '')

  if (!searchTerm) {
    return CLAUDE_SKILLS
  }

  return CLAUDE_SKILLS.filter(
    skill =>
      skill.name.toLowerCase().includes(searchTerm) ||
      skill.description.toLowerCase().includes(searchTerm)
  )
}
