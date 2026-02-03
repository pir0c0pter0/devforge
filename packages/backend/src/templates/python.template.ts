import { ContainerTemplate } from './types';

/**
 * Python development template
 * Pre-configured for Python development with venv, pip, and common tooling
 */
export const pythonTemplate: ContainerTemplate = {
  id: 'python',
  name: 'Python',
  description: 'Python development environment with virtual environments, pip, Poetry support, and common data science tools.',
  icon: 'python',
  category: 'language',
  tags: ['python', 'pip', 'venv', 'poetry', 'data-science', 'machine-learning'],
  defaultConfig: {
    image: 'claude-docker/both:latest',
    environment: {
      PYTHON_VERSION: '3.11',
      PYTHONDONTWRITEBYTECODE: '1',
      PYTHONUNBUFFERED: '1',
      PIP_NO_CACHE_DIR: 'off',
      PIP_DISABLE_PIP_VERSION_CHECK: 'on',
      VIRTUAL_ENV: '/home/developer/workspace/.venv',
      PATH: '/home/developer/workspace/.venv/bin:$PATH',
    },
    extensions: [
      'ms-python.python',
      'ms-python.vscode-pylance',
      'ms-python.debugpy',
      'ms-python.black-formatter',
      'ms-python.isort',
      'charliermarsh.ruff',
      'ms-toolsai.jupyter',
      'ms-toolsai.jupyter-keymap',
      'ms-toolsai.jupyter-renderers',
      'donjayamanne.python-environment-manager',
    ],
    postCreateCommands: [
      // Upgrade pip
      'python3 -m pip install --upgrade pip',
      // Install Poetry for dependency management
      'curl -sSL https://install.python-poetry.org | python3 -',
      // Add Poetry to PATH
      'echo \'export PATH="$HOME/.local/bin:$PATH"\' >> ~/.zshrc',
      // Install common development tools
      'python3 -m pip install --user black ruff mypy pytest pytest-cov ipython',
      // Install Jupyter for notebooks
      'python3 -m pip install --user jupyter jupyterlab',
      // Create project virtual environment
      'python3 -m venv /home/developer/workspace/.venv || true',
    ],
    workingDir: '/home/developer/workspace',
    ports: {
      8000: 8000,
      8888: 8888,
      5000: 5000,
    },
    resources: {
      cpuLimit: 2,
      memoryLimit: 4096,
      diskLimit: 20480,
    },
  },
  requiredEnvVars: [
    {
      name: 'ANTHROPIC_API_KEY',
      description: 'Anthropic API key for Claude Code (optional if using browser auth)',
      required: false,
      isSecret: true,
    },
    {
      name: 'OPENAI_API_KEY',
      description: 'OpenAI API key for GPT models (optional)',
      required: false,
      isSecret: true,
    },
    {
      name: 'HUGGINGFACE_TOKEN',
      description: 'HuggingFace token for model downloads (optional)',
      required: false,
      isSecret: true,
    },
  ],
};

export default pythonTemplate;
