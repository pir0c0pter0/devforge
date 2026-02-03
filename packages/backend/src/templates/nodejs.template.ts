import { ContainerTemplate } from './types';

/**
 * Node.js / TypeScript development template
 * Pre-configured for modern Node.js and TypeScript development
 */
export const nodejsTemplate: ContainerTemplate = {
  id: 'nodejs',
  name: 'Node.js / TypeScript',
  description: 'Full-featured Node.js and TypeScript development environment with pnpm, ESLint, Prettier, and common tooling.',
  icon: 'nodejs',
  category: 'language',
  tags: ['nodejs', 'typescript', 'javascript', 'npm', 'pnpm', 'web'],
  defaultConfig: {
    image: 'claude-docker/both:latest',
    environment: {
      NODE_ENV: 'development',
      NPM_CONFIG_PREFIX: '/home/developer/.npm-global',
      PATH: '/home/developer/.npm-global/bin:$PATH',
    },
    extensions: [
      'dbaeumer.vscode-eslint',
      'esbenp.prettier-vscode',
      'christian-kohler.npm-intellisense',
      'christian-kohler.path-intellisense',
      'formulahendry.auto-rename-tag',
      'bradlc.vscode-tailwindcss',
      'mikestead.dotenv',
      'orta.vscode-jest',
      'Prisma.prisma',
      'yoavbls.pretty-ts-errors',
    ],
    postCreateCommands: [
      // Ensure pnpm is available
      'corepack enable && corepack prepare pnpm@latest --activate',
      // Install TypeScript globally
      'pnpm add -g typescript ts-node tsx @types/node',
      // Install common development tools
      'pnpm add -g eslint prettier',
      // Configure npm/pnpm for global installs
      'mkdir -p /home/developer/.npm-global',
      'npm config set prefix /home/developer/.npm-global',
      // Initialize pnpm store if not exists
      'pnpm config set store-dir /home/developer/.pnpm-store',
    ],
    workingDir: '/home/developer/workspace',
    ports: {
      3000: 3000,
      4000: 4000,
      5173: 5173,
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
      name: 'GITHUB_TOKEN',
      description: 'GitHub personal access token for private repositories',
      required: false,
      isSecret: true,
    },
  ],
};

export default nodejsTemplate;
