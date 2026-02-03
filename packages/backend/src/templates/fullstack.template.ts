import { ContainerTemplate } from './types';

/**
 * Fullstack development template
 * Pre-configured for Next.js + API development with modern tooling
 */
export const fullstackTemplate: ContainerTemplate = {
  id: 'fullstack',
  name: 'Fullstack (Next.js + API)',
  description: 'Full-stack development environment with Next.js, React, Node.js API, PostgreSQL client, Prisma, and TailwindCSS.',
  icon: 'nextjs',
  category: 'fullstack',
  tags: ['nextjs', 'react', 'typescript', 'nodejs', 'api', 'fullstack', 'prisma', 'tailwindcss'],
  defaultConfig: {
    image: 'claude-docker/both:latest',
    environment: {
      NODE_ENV: 'development',
      NEXT_TELEMETRY_DISABLED: '1',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/dev?schema=public',
      NEXTAUTH_URL: 'http://localhost:3000',
      NEXTAUTH_SECRET: 'development-secret-change-in-production',
    },
    extensions: [
      // JavaScript/TypeScript
      'dbaeumer.vscode-eslint',
      'esbenp.prettier-vscode',
      'yoavbls.pretty-ts-errors',
      // React/Next.js
      'dsznajder.es7-react-js-snippets',
      'formulahendry.auto-rename-tag',
      'styled-components.vscode-styled-components',
      // CSS/Styling
      'bradlc.vscode-tailwindcss',
      'csstools.postcss',
      // Database
      'Prisma.prisma',
      'cweijan.vscode-postgresql-client2',
      // API Development
      'humao.rest-client',
      'rangav.vscode-thunder-client',
      // Testing
      'orta.vscode-jest',
      'firsttris.vscode-jest-runner',
      // Path/Import
      'christian-kohler.npm-intellisense',
      'christian-kohler.path-intellisense',
      // Environment
      'mikestead.dotenv',
    ],
    postCreateCommands: [
      // Ensure pnpm is available
      'corepack enable && corepack prepare pnpm@latest --activate',
      // Configure pnpm store
      'pnpm config set store-dir /home/developer/.pnpm-store',
      // Install global tools
      'pnpm add -g typescript ts-node tsx @types/node',
      'pnpm add -g prisma',
      'pnpm add -g create-next-app',
      // Install common dev tools
      'pnpm add -g eslint prettier',
      // If no package.json exists, create a Next.js project
      'cd /home/developer/workspace && [ ! -f package.json ] && pnpm create next-app . --typescript --tailwind --eslint --app --src-dir --use-pnpm --no-import-alias || true',
    ],
    workingDir: '/home/developer/workspace',
    ports: {
      3000: 3000,
      4000: 4000,
      5432: 5432,
      5555: 5555,
    },
    resources: {
      cpuLimit: 4,
      memoryLimit: 8192,
      diskLimit: 30720,
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
      name: 'DATABASE_URL',
      description: 'PostgreSQL database connection string',
      required: false,
      defaultValue: 'postgresql://postgres:postgres@localhost:5432/dev?schema=public',
    },
    {
      name: 'NEXTAUTH_SECRET',
      description: 'NextAuth.js secret for session encryption',
      required: false,
      isSecret: true,
      defaultValue: 'development-secret-change-in-production',
    },
    {
      name: 'GITHUB_ID',
      description: 'GitHub OAuth App ID for authentication',
      required: false,
      isSecret: true,
    },
    {
      name: 'GITHUB_SECRET',
      description: 'GitHub OAuth App Secret for authentication',
      required: false,
      isSecret: true,
    },
  ],
};

export default fullstackTemplate;
