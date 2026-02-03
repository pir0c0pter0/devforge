export type Language = 'pt-BR' | 'en'

export const translations = {
  'pt-BR': {
    // Layout
    appName: 'Claude Docker Manager',
    appDescription: 'Orquestração de containers com IA',
    nav: {
      dashboard: 'Painel',
      containers: 'Containers',
      settings: 'Configurações',
      newContainer: 'Novo Container',
    },

    // Dashboard
    dashboard: {
      title: 'Painel',
      subtitle: 'Monitore e gerencie seus containers Docker',
      totalContainers: 'Total de Containers',
      running: 'Rodando',
      activeAgents: 'Agentes Ativos',
      queueLength: 'Fila',
      containers: 'Containers',
      noContainersYet: 'Nenhum container ainda',
      getStarted: 'Comece criando seu primeiro container',
      createContainer: 'Criar Container',
      loadingContainers: 'Carregando containers...',
      errorLoading: 'Erro ao Carregar Containers',
    },

    // Containers
    containersList: {
      title: 'Containers',
      subtitle: 'Gerencie seus containers Docker com Claude Code e VS Code',
      newContainer: 'Novo Container',
      status: 'Status',
      template: 'Template',
      allStatus: 'Todos os Status',
      allTemplates: 'Todos os Templates',
      clearFilters: 'Limpar Filtros',
      noContainersFound: 'Nenhum container encontrado',
      adjustFilters: 'Tente ajustar seus filtros',
    },

    // Container Card
    container: {
      cpu: 'CPU',
      memory: 'Memória',
      disk: 'Disco',
      agents: 'Agentes',
      queue: 'Fila',
      cores: 'cores',
      start: 'Iniciar',
      stop: 'Parar',
      starting: 'Iniciando...',
      shell: 'Terminal',
      vscode: 'VS Code',
      delete: 'Excluir',
      deleting: 'Excluindo...',
      confirmDelete: 'Tem certeza que deseja excluir',
      failedStart: 'Falha ao iniciar container',
      failedStop: 'Falha ao parar container',
      failedDelete: 'Falha ao excluir container',
      failedShell: 'Falha ao abrir terminal',
      failedVscode: 'Falha ao abrir VS Code',
    },

    // Status
    status: {
      running: 'rodando',
      stopped: 'parado',
      creating: 'criando',
      error: 'erro',
    },

    // Templates
    templates: {
      claude: 'Claude',
      vscode: 'VS Code',
      both: 'Ambos',
    },

    // Modes
    modes: {
      interactive: 'interativo',
      autonomous: 'autônomo',
    },

    // Create Container
    createContainer: {
      title: 'Criar Novo Container',
      subtitle: 'Configure e inicie um novo container Docker com Claude Code e VS Code',
      name: 'Nome do Container',
      namePlaceholder: 'meu-container',
      nameRequired: 'Nome é obrigatório',
      nameMaxLength: 'Nome deve ter no máximo 50 caracteres',
      nameInvalid: 'Nome pode conter apenas letras, números, hífens e underscores',
      template: 'Template',
      templateClaudeVscode: 'Claude + VS Code',
      mode: 'Modo',
      repositoryType: 'Tipo de Repositório',
      emptyFolder: 'Pasta Vazia',
      githubClone: 'Clone do GitHub',
      repositoryUrl: 'URL do Repositório',
      repositoryUrlPlaceholder: 'https://github.com/usuario/repo',
      repositoryUrlRequired: 'URL do repositório é obrigatória quando clonar do GitHub',
      resourceLimits: 'Limites de Recursos',
      cpuCores: 'Núcleos de CPU',
      memoryMb: 'Memória (MB)',
      diskGb: 'Espaço em Disco (GB)',
      creating: 'Criando...',
      create: 'Criar Container',
      cancel: 'Cancelar',
      failedCreate: 'Falha ao criar container',
      unexpectedError: 'Ocorreu um erro inesperado',
    },

    // Settings
    settings: {
      title: 'Configurações',
      subtitle: 'Gerencie a autenticação e configurações do sistema',
      loading: 'Carregando configurações...',

      // Claude Auth
      claudeAuth: {
        title: 'Autenticação do Claude Code',
        subtitle: 'Autenticação via navegador (conta Personal/Max/Pro)',
        authenticated: 'Autenticado',
        notAuthenticated: 'Não autenticado',
        skills: 'Skills',
        agents: 'Agentes',
        rules: 'Regras',
        lastAuth: 'Última Auth',
        credentialsShared: 'Credenciais serão compartilhadas com os containers automaticamente',
        logout: 'Deslogar',
        confirmLogout: 'Tem certeza que deseja deslogar do Claude Code?',
        authRequired: 'O Claude Code usa autenticação via navegador. Você precisa fazer login para que os containers possam usar o Claude.',
        configureAuth: 'Configurar autenticação',
        authInstructions: 'Instruções para autenticar:',
        verifyAuth: 'Verificar autenticação',
      },

      // GitHub SSH
      github: {
        title: 'GitHub / SSH',
        subtitle: 'Configure SSH para git clone nos containers',
        configured: 'Configurado',
        notConfigured: 'Não configurado',
        sshConfigured: 'Chave SSH configurada. Copie a chave pública e adicione ao GitHub.',
        publicKey: 'Chave Pública',
        copy: 'Copiar',
        copied: 'Chave pública copiada!',
        addToGithub: 'Adicionar ao GitHub',
        verify: 'Verificar',
        connectedAs: 'GitHub conectado como',
        sshInstructions: 'Para clonar repositórios privados nos containers, você precisa configurar uma chave SSH.',
        step1: 'Gere uma chave SSH abaixo',
        step2: 'Copie a chave pública',
        step3: 'Adicione ao GitHub em Settings > SSH and GPG keys',
        email: 'Email (para identificar a chave)',
        emailPlaceholder: 'seu@email.com',
        emailInvalid: 'Por favor, insira um email válido',
        generating: 'Gerando...',
        generateSsh: 'Gerar chave SSH',
        configureSsh: 'Configurar SSH',
        generateError: 'Erro ao gerar chave SSH',
      },

      // System Status
      system: {
        title: 'Status do Sistema',
        docker: 'Docker',
        dockerRunning: 'Rodando',
        dockerStopped: 'Parado - execute: sudo systemctl start docker',
        dockerGroup: 'Grupo Docker',
        dockerGroupOk: 'Usuário no grupo',
        dockerGroupError: 'Execute: sudo usermod -aG docker $USER',
        redis: 'Redis',
        redisRunning: 'Rodando',
        redisStopped: 'Opcional - para filas de instruções',
        sshKeys: 'Chaves SSH',
        sshFound: 'Chave encontrada',
        sshNotFound: 'Configure acima',
      },

      // Configuration
      config: {
        title: 'Configuração',
        backendPort: 'Porta Backend',
        frontendPort: 'Porta Frontend',
        environment: 'Ambiente',
        redisUrl: 'Redis URL',
        defaultCpu: 'CPU Padrão',
        defaultMemory: 'Memória Padrão',
        defaultDisk: 'Disco Padrão',
        editConfig: 'Para alterar, edite:',
      },

      // Language
      language: {
        title: 'Idioma',
        subtitle: 'Selecione o idioma da interface',
        portuguese: 'Português (Brasil)',
        english: 'English',
      },
    },

    // Common
    common: {
      loading: 'Carregando...',
      error: 'Erro',
      success: 'Sucesso',
      cancel: 'Cancelar',
      save: 'Salvar',
      confirm: 'Confirmar',
      close: 'Fechar',
      required: 'obrigatório',
    },
  },

  en: {
    // Layout
    appName: 'Claude Docker Manager',
    appDescription: 'Container orchestration with AI',
    nav: {
      dashboard: 'Dashboard',
      containers: 'Containers',
      settings: 'Settings',
      newContainer: 'New Container',
    },

    // Dashboard
    dashboard: {
      title: 'Dashboard',
      subtitle: 'Monitor and manage your Docker containers',
      totalContainers: 'Total Containers',
      running: 'Running',
      activeAgents: 'Active Agents',
      queueLength: 'Queue Length',
      containers: 'Containers',
      noContainersYet: 'No containers yet',
      getStarted: 'Get started by creating your first container',
      createContainer: 'Create Container',
      loadingContainers: 'Loading containers...',
      errorLoading: 'Error Loading Containers',
    },

    // Containers
    containersList: {
      title: 'Containers',
      subtitle: 'Manage your Docker containers with Claude Code and VS Code',
      newContainer: 'New Container',
      status: 'Status',
      template: 'Template',
      allStatus: 'All Status',
      allTemplates: 'All Templates',
      clearFilters: 'Clear Filters',
      noContainersFound: 'No containers found',
      adjustFilters: 'Try adjusting your filters',
    },

    // Container Card
    container: {
      cpu: 'CPU',
      memory: 'Memory',
      disk: 'Disk',
      agents: 'Agents',
      queue: 'Queue',
      cores: 'cores',
      start: 'Start',
      stop: 'Stop',
      starting: 'Starting...',
      shell: 'Shell',
      vscode: 'VS Code',
      delete: 'Delete',
      deleting: 'Deleting...',
      confirmDelete: 'Are you sure you want to delete',
      failedStart: 'Failed to start container',
      failedStop: 'Failed to stop container',
      failedDelete: 'Failed to delete container',
      failedShell: 'Failed to open shell',
      failedVscode: 'Failed to open VS Code',
    },

    // Status
    status: {
      running: 'running',
      stopped: 'stopped',
      creating: 'creating',
      error: 'error',
    },

    // Templates
    templates: {
      claude: 'Claude',
      vscode: 'VS Code',
      both: 'Both',
    },

    // Modes
    modes: {
      interactive: 'interactive',
      autonomous: 'autonomous',
    },

    // Create Container
    createContainer: {
      title: 'Create New Container',
      subtitle: 'Configure and launch a new Docker container with Claude Code and VS Code',
      name: 'Container Name',
      namePlaceholder: 'my-container',
      nameRequired: 'Name is required',
      nameMaxLength: 'Name must be 50 characters or less',
      nameInvalid: 'Name can only contain letters, numbers, hyphens, and underscores',
      template: 'Template',
      templateClaudeVscode: 'Claude + VS Code',
      mode: 'Mode',
      repositoryType: 'Repository Type',
      emptyFolder: 'Empty Folder',
      githubClone: 'GitHub Clone',
      repositoryUrl: 'Repository URL',
      repositoryUrlPlaceholder: 'https://github.com/username/repo',
      repositoryUrlRequired: 'Repository URL is required when cloning from GitHub',
      resourceLimits: 'Resource Limits',
      cpuCores: 'CPU Cores',
      memoryMb: 'Memory (MB)',
      diskGb: 'Disk Space (GB)',
      creating: 'Creating...',
      create: 'Create Container',
      cancel: 'Cancel',
      failedCreate: 'Failed to create container',
      unexpectedError: 'An unexpected error occurred',
    },

    // Settings
    settings: {
      title: 'Settings',
      subtitle: 'Manage authentication and system settings',
      loading: 'Loading settings...',

      // Claude Auth
      claudeAuth: {
        title: 'Claude Code Authentication',
        subtitle: 'Browser-based authentication (Personal/Max/Pro account)',
        authenticated: 'Authenticated',
        notAuthenticated: 'Not authenticated',
        skills: 'Skills',
        agents: 'Agents',
        rules: 'Rules',
        lastAuth: 'Last Auth',
        credentialsShared: 'Credentials will be shared with containers automatically',
        logout: 'Logout',
        confirmLogout: 'Are you sure you want to logout from Claude Code?',
        authRequired: 'Claude Code uses browser-based authentication. You need to login for containers to use Claude.',
        configureAuth: 'Configure authentication',
        authInstructions: 'Instructions to authenticate:',
        verifyAuth: 'Verify authentication',
      },

      // GitHub SSH
      github: {
        title: 'GitHub / SSH',
        subtitle: 'Configure SSH for git clone in containers',
        configured: 'Configured',
        notConfigured: 'Not configured',
        sshConfigured: 'SSH key configured. Copy the public key and add to GitHub.',
        publicKey: 'Public Key',
        copy: 'Copy',
        copied: 'Public key copied!',
        addToGithub: 'Add to GitHub',
        verify: 'Verify',
        connectedAs: 'GitHub connected as',
        sshInstructions: 'To clone private repositories in containers, you need to configure an SSH key.',
        step1: 'Generate an SSH key below',
        step2: 'Copy the public key',
        step3: 'Add to GitHub in Settings > SSH and GPG keys',
        email: 'Email (to identify the key)',
        emailPlaceholder: 'your@email.com',
        emailInvalid: 'Please enter a valid email',
        generating: 'Generating...',
        generateSsh: 'Generate SSH key',
        configureSsh: 'Configure SSH',
        generateError: 'Error generating SSH key',
      },

      // System Status
      system: {
        title: 'System Status',
        docker: 'Docker',
        dockerRunning: 'Running',
        dockerStopped: 'Stopped - run: sudo systemctl start docker',
        dockerGroup: 'Docker Group',
        dockerGroupOk: 'User in group',
        dockerGroupError: 'Run: sudo usermod -aG docker $USER',
        redis: 'Redis',
        redisRunning: 'Running',
        redisStopped: 'Optional - for instruction queues',
        sshKeys: 'SSH Keys',
        sshFound: 'Key found',
        sshNotFound: 'Configure above',
      },

      // Configuration
      config: {
        title: 'Configuration',
        backendPort: 'Backend Port',
        frontendPort: 'Frontend Port',
        environment: 'Environment',
        redisUrl: 'Redis URL',
        defaultCpu: 'Default CPU',
        defaultMemory: 'Default Memory',
        defaultDisk: 'Default Disk',
        editConfig: 'To change, edit:',
      },

      // Language
      language: {
        title: 'Language',
        subtitle: 'Select interface language',
        portuguese: 'Português (Brasil)',
        english: 'English',
      },
    },

    // Common
    common: {
      loading: 'Loading...',
      error: 'Error',
      success: 'Success',
      cancel: 'Cancel',
      save: 'Save',
      confirm: 'Confirm',
      close: 'Close',
      required: 'required',
    },
  },
} as const

export type TranslationKey = keyof typeof translations['pt-BR']
