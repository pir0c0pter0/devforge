# @claude-docker/shared

Shared types, schemas, and constants for Claude Docker Web project.

## Installation

```bash
pnpm install
```

## Build

```bash
pnpm build
```

## Development

```bash
pnpm dev
```

## Usage

### Types

```typescript
import type { Container, ContainerConfig, Instruction } from '@claude-docker/shared'

const config: ContainerConfig = {
  name: 'my-container',
  template: 'claude',
  mode: 'interactive',
  repoType: 'empty',
  cpuLimit: '2.0',
  memoryLimit: '4G',
  diskLimit: '20G',
}
```

### Schemas

```typescript
import { containerConfigSchema, addInstructionSchema } from '@claude-docker/shared'

// Validate input
const result = containerConfigSchema.safeParse(userInput)
if (!result.success) {
  console.error(result.error)
}
```

### Constants

```typescript
import { DEFAULT_CPU_LIMIT, SOCKET_EVENTS, API_ENDPOINTS } from '@claude-docker/shared'

// Use constants
const cpuLimit = DEFAULT_CPU_LIMIT
const metricsEvent = SOCKET_EVENTS.CONTAINER.METRICS
const endpoint = API_ENDPOINTS.CONTAINERS
```

## Structure

```
packages/shared/
├── src/
│   ├── types/
│   │   ├── container.types.ts    # Container-related types
│   │   ├── instruction.types.ts  # Instruction-related types
│   │   ├── metrics.types.ts      # Metrics-related types
│   │   └── events.types.ts       # WebSocket event types
│   ├── schemas/
│   │   ├── container.schema.ts   # Zod schemas for containers
│   │   └── instruction.schema.ts # Zod schemas for instructions
│   ├── constants/
│   │   └── index.ts              # Shared constants
│   └── index.ts                  # Main entry point
├── package.json
├── tsconfig.json
└── README.md
```

## License

MIT
