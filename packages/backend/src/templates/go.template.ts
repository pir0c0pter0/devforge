import { ContainerTemplate } from './types';

/**
 * Go development template
 * Pre-configured for Go development with modules, LSP, and common tooling
 */
export const goTemplate: ContainerTemplate = {
  id: 'go',
  name: 'Go',
  description: 'Go development environment with modules, gopls LSP, delve debugger, and common tooling.',
  icon: 'go',
  category: 'language',
  tags: ['go', 'golang', 'backend', 'api', 'microservices', 'cli'],
  defaultConfig: {
    image: 'claude-docker/full:latest',
    environment: {
      GOPATH: '/home/developer/go',
      GOROOT: '/usr/local/go',
      GO111MODULE: 'on',
      GOPROXY: 'https://proxy.golang.org,direct',
      GOFLAGS: '-mod=mod',
      CGO_ENABLED: '1',
      PATH: '/usr/local/go/bin:/home/developer/go/bin:$PATH',
    },
    extensions: [
      'golang.go',
      'golang.go-nightly',
      'premparihar.gotestexplorer',
      'zxh404.vscode-proto3',
      'mikestead.dotenv',
    ],
    postCreateCommands: [
      // Verify Go installation
      'go version',
      // Create Go workspace directories
      'mkdir -p /home/developer/go/{bin,src,pkg}',
      // Install essential Go tools
      'go install golang.org/x/tools/gopls@latest',
      'go install github.com/go-delve/delve/cmd/dlv@latest',
      'go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest',
      'go install github.com/cosmtrek/air@latest',
      'go install github.com/swaggo/swag/cmd/swag@latest',
      'go install google.golang.org/protobuf/cmd/protoc-gen-go@latest',
      'go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest',
      // Install mockery for test mocks
      'go install github.com/vektra/mockery/v2@latest',
      // Initialize a go.mod file if not exists
      'cd /home/developer/workspace && [ ! -f go.mod ] && go mod init project || true',
    ],
    workingDir: '/home/developer/workspace',
    ports: {
      8080: 8080,
      9090: 9090,
      3000: 3000,
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
      description: 'GitHub personal access token for private Go modules',
      required: false,
      isSecret: true,
    },
  ],
};

export default goTemplate;
