export type Language = 'pt-BR' | 'en'

export const translations = {
  'pt-BR': {
    // Layout
    appName: 'Claude Docker Manager',
    appDescription: 'Orquestração de containers com IA',
    nav: {
      dashboard: 'Painel',
      containers: 'Containers',
      templates: 'Templates',
      metrics: 'Métricas',
      settings: 'Configurações',
      newContainer: 'Novo Container',
      signOut: 'Sair',
      manager: 'Gerenciador',
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
      starting: 'Iniciando',
      shell: 'Terminal',
      instructions: 'Instruções',
      vscode: 'VS Code',
      delete: 'Excluir',
      deleting: 'Excluindo',
      confirmDelete: 'Tem certeza que deseja excluir',
      failedStart: 'Falha ao iniciar container',
      failedStop: 'Falha ao parar container',
      failedDelete: 'Falha ao excluir container',
      failedShell: 'Falha ao abrir terminal',
      failedVscode: 'Falha ao abrir VS Code',
      startingPolling: 'Aguardando container iniciar',
      startTimeout: 'Tempo esgotado ao iniciar',
      // Disk alerts
      diskWarning: 'Uso de disco acima de 80%',
      diskCritical: 'Uso de disco crítico! Acima de 95%',
      softLimit: 'Limite soft',
      // Actions
      restart: 'Reiniciar',
      restarting: 'Reiniciando',
      processing: 'Processando',
      waiting: 'Aguardando',
      reconnecting: 'Reconectando',
      connecting: 'Conectando',
    },

    // Container Detail Page
    containerDetail: {
      // Tabs
      tabs: {
        overview: 'Visão Geral',
        metrics: 'Métricas',
        instructions: 'Instruções',
        logs: 'Logs',
        terminal: 'Terminal',
        settings: 'Configurações',
      },
      // Sub-tabs
      subTabs: {
        shell: 'Shell',
        claudeCode: 'Claude Code',
      },
      // Loading states
      loadingTerminal: 'Carregando terminal',
      loadingClaudeChat: 'Carregando Claude Chat',
      loadingContainer: 'Carregando container',
      errorLoading: 'Erro ao Carregar Container',
      containerNotFound: 'Container não encontrado',
      backToContainers: 'Voltar para Containers',
      // Info section
      repository: 'Repositório',
      containerId: 'ID',
      createdAt: 'Criado em',
      activeAgents: 'Agentes Ativos',
      queueLength: 'Tamanho da Fila',
      containerInfo: 'Informações do Container',
      // Metrics section
      cpuUsage: 'Uso de CPU',
      memoryUsage: 'Uso de Memória',
      diskUsage: 'Uso de Disco',
      coresAllocated: 'cores alocados',
      mbLimit: 'MB limite',
      gbLimit: 'GB limite',
      realTimeMetrics: 'Métricas em Tempo Real',
      resourceLimits: 'Limites de Recursos',
      currentUsage: 'Uso Atual',
      usagePercentage: 'Percentual de Uso',
      // VS Code section
      vscodeWeb: 'VS Code Web',
      openInNewTab: 'Abrir em nova aba',
      // Logs section
      containerLogs: 'Logs do Container',
      logsPlaceholder: '[Streaming de logs será implementado com conexão WebSocket]',
      // Terminal section
      terminalUnavailable: 'Terminal Indisponível',
      startContainerForTerminal: 'Inicie o container para acessar o terminal.',
      // Settings section
      containerSettings: 'Configurações do Container',
      containerName: 'Nome do Container',
      template: 'Template',
      mode: 'Modo',
      resourceLimitsTitle: 'Limites de Recursos',
      cpuCores: 'Núcleos de CPU',
      memoryMb: 'Memória (MB)',
      diskGb: 'Disco (GB)',
      cannotModifyRunning: 'Limites de recursos não podem ser modificados enquanto o container está rodando.',
      // Danger zone
      dangerZone: 'Zona de Perigo',
      dangerZoneWarning: 'Uma vez que você excluir um container, não há como voltar atrás. Por favor, tenha certeza.',
      deleteContainer: 'Excluir Container',
    },

    // Claude Chat
    claudeChat: {
      title: 'Claude Code',
      clear: 'Limpar',
      stop: 'Parar',
      start: 'Iniciar',
      sendMessage: 'Envie uma mensagem para o Claude Code',
      startFirst: 'Inicie o Claude Code primeiro',
      thinking: 'Claude está pensando',
      thinkingSubtext: 'Processando sua instrução...',
      error: 'Erro',
      connected: 'Conectado',
      disconnected: 'Desconectado',
      connecting: 'Conectando',
      placeholder: 'Digite sua instrução...',
      placeholderDisabled: 'Inicie o Claude Code primeiro',
      pressEnter: 'Pressione Enter para enviar',
    },

    // Templates Page
    templatesPage: {
      title: 'Templates',
      subtitle: 'Escolha um template para seu container',
      useTemplate: 'Usar Template',
      nodejs: {
        name: 'Node.js',
        description: 'Runtime JavaScript com npm, yarn e pnpm pré-instalados. Ideal para desenvolvimento web e serviços backend.',
      },
      python: {
        name: 'Python',
        description: 'Python 3.x com pip e suporte a ambiente virtual. Perfeito para ciência de dados, ML e scripts.',
      },
      golang: {
        name: 'Go',
        description: 'Linguagem de programação Go com suporte a módulos. Ótimo para construir software eficiente e confiável.',
      },
      rust: {
        name: 'Rust',
        description: 'Rust com gerenciador de pacotes Cargo. Construa software de sistema rápido, confiável e eficiente.',
      },
      java: {
        name: 'Java',
        description: 'OpenJDK com Maven e Gradle. Ambiente de desenvolvimento enterprise.',
      },
      claude: {
        name: 'Claude Code',
        description: 'Ambiente Claude Code com todas as capacidades de IA habilitadas. Suporte completo a desenvolvimento autônomo.',
      },
    },

    // Status
    status: {
      running: 'rodando',
      stopped: 'parado',
      creating: 'criando',
      error: 'erro',
      exited: 'encerrado',
      paused: 'pausado',
      restarting: 'reiniciando',
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
      creating: 'Criando',
      create: 'Criar Container',
      cancel: 'Cancelar',
      failedCreate: 'Falha ao criar container',
      unexpectedError: 'Ocorreu um erro inesperado',
      progressCreating: 'Criando container',
      progressStarting: 'Iniciando container',
      progressCloningRepo: 'Clonando repositório',
      progressCopyingConfigs: 'Copiando configurações',
      progressFinishing: 'Finalizando',
      // Progress messages (real-time)
      progress: {
        validating: 'Validando configurações',
        creating: 'Criando container Docker',
        starting: 'Iniciando container',
        cloning: 'Clonando repositório',
        configuring: 'Configurando ambiente',
        stopping: 'Finalizando setup',
        saving: 'Salvando configurações',
        ready: 'Container pronto!',
        error: 'Erro na criação',
      },
    },

    // Settings
    settings: {
      title: 'Configurações',
      subtitle: 'Gerencie a autenticação e configurações do sistema',
      loading: 'Carregando configurações',

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
        generatingText: 'Gerando',
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

      // Diagnostics
      diagnostics: {
        title: 'Diagnóstico do Sistema',
        runDiagnostics: 'Executar Diagnóstico',
        running: 'Executando diagnóstico',
        ok: 'OK',
        warning: 'Aviso',
        error: 'Erro',
        summary: 'Resumo',
        errors: 'erros',
        warnings: 'avisos',
        allOk: 'Todos os sistemas funcionando',
        fixInstructions: 'Instruções para corrigir:',
        details: 'Detalhes:',
        close: 'Fechar',
        timestamp: 'Executado em',
        user: 'Usuário',
        platform: 'Plataforma',
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

    // Instruction Queue
    instructionQueue: {
      title: 'Fila de Instruções',
      loading: 'Carregando fila',
      empty: 'Nenhuma instrução na fila',
      placeholder: 'Digite uma instrução...',
      add: 'Adicionar',
      adding: 'Adicionando',
      created: 'Criada em',
      finished: 'Finalizada em',
      failedFetch: 'Erro ao carregar fila',
      failedAdd: 'Erro ao adicionar instrução',
      loadingDetails: 'Carregando detalhes',
      fullInstruction: 'Instrução Completa',
      result: 'Resultado',
      errorDetails: 'Detalhes do Erro',
      clickToExpand: 'Clique para ver detalhes',
      status: {
        waiting: 'aguardando',
        pending: 'pendente',
        active: 'ativo',
        running: 'executando',
        completed: 'concluído',
        failed: 'falhou',
        delayed: 'atrasado',
        deadLetter: 'falha permanente',
      },
    },

    // Common
    common: {
      loading: 'Carregando',
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
      templates: 'Templates',
      metrics: 'Metrics',
      settings: 'Settings',
      newContainer: 'New Container',
      signOut: 'Sign out',
      manager: 'Manager',
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
      starting: 'Starting',
      shell: 'Shell',
      instructions: 'Instructions',
      vscode: 'VS Code',
      delete: 'Delete',
      deleting: 'Deleting',
      confirmDelete: 'Are you sure you want to delete',
      failedStart: 'Failed to start container',
      failedStop: 'Failed to stop container',
      failedDelete: 'Failed to delete container',
      failedShell: 'Failed to open shell',
      failedVscode: 'Failed to open VS Code',
      startingPolling: 'Waiting for container to start',
      startTimeout: 'Timeout while starting',
      // Disk alerts
      diskWarning: 'Disk usage above 80%',
      diskCritical: 'Critical disk usage! Above 95%',
      softLimit: 'Soft limit',
      // Actions
      restart: 'Restart',
      restarting: 'Restarting',
      processing: 'Processing',
      waiting: 'Waiting',
      reconnecting: 'Reconnecting',
      connecting: 'Connecting',
    },

    // Container Detail Page
    containerDetail: {
      // Tabs
      tabs: {
        overview: 'Overview',
        metrics: 'Metrics',
        instructions: 'Instructions',
        logs: 'Logs',
        terminal: 'Terminal',
        settings: 'Settings',
      },
      // Sub-tabs
      subTabs: {
        shell: 'Shell',
        claudeCode: 'Claude Code',
      },
      // Loading states
      loadingTerminal: 'Loading terminal',
      loadingClaudeChat: 'Loading Claude Chat',
      loadingContainer: 'Loading container',
      errorLoading: 'Error Loading Container',
      containerNotFound: 'Container not found',
      backToContainers: 'Back to Containers',
      // Info section
      repository: 'Repository',
      containerId: 'ID',
      createdAt: 'Created At',
      activeAgents: 'Active Agents',
      queueLength: 'Queue Length',
      containerInfo: 'Container Info',
      // Metrics section
      cpuUsage: 'CPU Usage',
      memoryUsage: 'Memory Usage',
      diskUsage: 'Disk Usage',
      coresAllocated: 'cores allocated',
      mbLimit: 'MB limit',
      gbLimit: 'GB limit',
      realTimeMetrics: 'Real-time Metrics',
      resourceLimits: 'Resource Limits',
      currentUsage: 'Current Usage',
      usagePercentage: 'Usage Percentage',
      // VS Code section
      vscodeWeb: 'VS Code Web',
      openInNewTab: 'Open in new tab',
      // Logs section
      containerLogs: 'Container Logs',
      logsPlaceholder: '[Log streaming will be implemented with WebSocket connection]',
      // Terminal section
      terminalUnavailable: 'Terminal Unavailable',
      startContainerForTerminal: 'Start the container to access the terminal.',
      // Settings section
      containerSettings: 'Container Settings',
      containerName: 'Container Name',
      template: 'Template',
      mode: 'Mode',
      resourceLimitsTitle: 'Resource Limits',
      cpuCores: 'CPU Cores',
      memoryMb: 'Memory (MB)',
      diskGb: 'Disk (GB)',
      cannotModifyRunning: 'Resource limits cannot be modified while the container is running.',
      // Danger zone
      dangerZone: 'Danger Zone',
      dangerZoneWarning: 'Once you delete a container, there is no going back. Please be certain.',
      deleteContainer: 'Delete Container',
    },

    // Claude Chat
    claudeChat: {
      title: 'Claude Code',
      clear: 'Clear',
      stop: 'Stop',
      start: 'Start',
      sendMessage: 'Send a message to Claude Code',
      startFirst: 'Start Claude Code first',
      thinking: 'Claude is thinking',
      thinkingSubtext: 'Processing your instruction...',
      error: 'Error',
      connected: 'Connected',
      disconnected: 'Disconnected',
      connecting: 'Connecting',
      placeholder: 'Type your instruction...',
      placeholderDisabled: 'Start Claude Code first',
      pressEnter: 'Press Enter to send',
    },

    // Templates Page
    templatesPage: {
      title: 'Templates',
      subtitle: 'Choose a template for your container',
      useTemplate: 'Use Template',
      nodejs: {
        name: 'Node.js',
        description: 'JavaScript runtime with npm, yarn, and pnpm pre-installed. Ideal for web development and backend services.',
      },
      python: {
        name: 'Python',
        description: 'Python 3.x with pip and virtual environment support. Perfect for data science, ML, and scripting.',
      },
      golang: {
        name: 'Go',
        description: 'Go programming language with modules support. Great for building efficient, reliable software.',
      },
      rust: {
        name: 'Rust',
        description: 'Rust with Cargo package manager. Build fast, reliable, and efficient system software.',
      },
      java: {
        name: 'Java',
        description: 'OpenJDK with Maven and Gradle. Enterprise-grade development environment.',
      },
      claude: {
        name: 'Claude Code',
        description: 'Claude Code environment with all AI capabilities enabled. Full autonomous development support.',
      },
    },

    // Status
    status: {
      running: 'running',
      stopped: 'stopped',
      creating: 'creating',
      error: 'error',
      exited: 'exited',
      paused: 'paused',
      restarting: 'restarting',
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
      creating: 'Creating',
      create: 'Create Container',
      cancel: 'Cancel',
      failedCreate: 'Failed to create container',
      unexpectedError: 'An unexpected error occurred',
      progressCreating: 'Creating container',
      progressStarting: 'Starting container',
      progressCloningRepo: 'Cloning repository',
      progressCopyingConfigs: 'Copying configurations',
      progressFinishing: 'Finishing',
      // Progress messages (real-time)
      progress: {
        validating: 'Validating configuration',
        creating: 'Creating Docker container',
        starting: 'Starting container',
        cloning: 'Cloning repository',
        configuring: 'Configuring environment',
        stopping: 'Finishing setup',
        saving: 'Saving configuration',
        ready: 'Container ready!',
        error: 'Creation error',
      },
    },

    // Settings
    settings: {
      title: 'Settings',
      subtitle: 'Manage authentication and system settings',
      loading: 'Loading settings',

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
        generatingText: 'Generating',
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

      // Diagnostics
      diagnostics: {
        title: 'System Diagnostics',
        runDiagnostics: 'Run Diagnostics',
        running: 'Running diagnostics',
        ok: 'OK',
        warning: 'Warning',
        error: 'Error',
        summary: 'Summary',
        errors: 'errors',
        warnings: 'warnings',
        allOk: 'All systems operational',
        fixInstructions: 'Instructions to fix:',
        details: 'Details:',
        close: 'Close',
        timestamp: 'Executed at',
        user: 'User',
        platform: 'Platform',
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

    // Instruction Queue
    instructionQueue: {
      title: 'Instruction Queue',
      loading: 'Loading queue',
      empty: 'No instructions in queue',
      placeholder: 'Enter an instruction...',
      add: 'Add',
      adding: 'Adding',
      created: 'Created at',
      finished: 'Finished at',
      failedFetch: 'Failed to load queue',
      failedAdd: 'Failed to add instruction',
      loadingDetails: 'Loading details',
      fullInstruction: 'Full Instruction',
      result: 'Result',
      errorDetails: 'Error Details',
      clickToExpand: 'Click to view details',
      status: {
        waiting: 'waiting',
        pending: 'pending',
        active: 'active',
        running: 'running',
        completed: 'completed',
        failed: 'failed',
        delayed: 'delayed',
        deadLetter: 'permanent failure',
      },
    },

    // Common
    common: {
      loading: 'Loading',
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
