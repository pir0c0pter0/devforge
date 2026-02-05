# DevForge - Frontend

Modern React dashboard for AI-powered container orchestration with Claude Code and VS Code integration.

## Tech Stack

- **Next.js 15** - React framework with App Router
- **React 19** - Latest React with Server Components
- **TypeScript** - Type-safe development
- **TailwindCSS** - Utility-first styling
- **Zustand** - Lightweight state management
- **Socket.io Client** - Real-time WebSocket communication
- **Recharts** - Data visualization for metrics
- **Zod** - Schema validation

## Features

### Dashboard
- Overview of all containers with status indicators
- Real-time metrics (CPU, Memory, Disk)
- Active agents and queue length tracking
- Quick actions for container management

### Container Management
- Create new containers with custom configuration
- Start, stop, restart containers
- Delete containers with confirmation
- Filter by status and template type
- Real-time status updates via WebSocket

### Container Details
- Detailed metrics with live charts
- Resource usage visualization
- Instruction queue management
- Quick access to shell and VS Code
- Container metadata display

### Real-time Updates
- WebSocket integration for live metrics
- Auto-updating container status
- Queue length synchronization
- No page refresh needed

## Project Structure

```
src/
├── app/                           # Next.js App Router pages
│   ├── layout.tsx                 # Root layout with header
│   ├── page.tsx                   # Dashboard home page
│   ├── containers/
│   │   ├── page.tsx              # Container list with filters
│   │   ├── new/
│   │   │   └── page.tsx          # Create container form
│   │   └── [id]/
│   │       └── page.tsx          # Container detail page
│   └── globals.css               # Global styles + Tailwind
│
├── components/                    # React components
│   ├── container-card.tsx        # Container card with actions
│   ├── create-container-form.tsx # Form with validation
│   ├── instruction-queue.tsx     # Queue manager component
│   └── metrics-chart.tsx         # Real-time chart
│
├── hooks/                         # Custom React hooks
│   ├── use-containers.ts         # Container CRUD operations
│   └── use-metrics.ts            # WebSocket metrics hook
│
├── lib/                           # Core utilities
│   ├── api-client.ts             # REST API client
│   ├── websocket.ts              # Socket.io client
│   └── types.ts                  # TypeScript types
│
└── stores/                        # State management
    └── container.store.ts        # Zustand store
```

## Getting Started

### Prerequisites

- Node.js 18+ with pnpm
- Backend API running on port 3001

### Installation

```bash
cd packages/frontend
pnpm install
```

### Environment Variables

Create `.env.local`:

```bash
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3001
```

### Development

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000)

### Build

```bash
pnpm build
pnpm start
```

### Type Checking

```bash
pnpm type-check
```

## Architecture

### State Management

- **Zustand Store**: Centralized container state
- **Immutable Updates**: All state changes create new objects
- **WebSocket Integration**: Real-time updates flow through store

### Data Flow

1. **Initial Load**: `use-containers` hook fetches from API
2. **User Actions**: Button clicks trigger API calls
3. **Optimistic Updates**: UI updates immediately
4. **WebSocket**: Server pushes real-time metrics
5. **Store Updates**: All data flows through Zustand

### Component Strategy

- **Server Components**: Static pages, layouts
- **Client Components**: Interactive UI with `'use client'`
- **Hooks**: Encapsulate API and WebSocket logic
- **Forms**: Zod validation with error handling

### API Communication

```typescript
// REST API for CRUD operations
apiClient.createContainer(data)
apiClient.startContainer(id)
apiClient.deleteContainer(id)

// WebSocket for real-time updates
wsClient.connect({ onMetricsUpdate, onContainerUpdate })
wsClient.subscribeToContainer(containerId)
```

## Key Features Implementation

### Container Card

- Status badge (running/stopped/creating/error)
- Template badge (claude/vscode/both)
- Mode badge (interactive/autonomous)
- Resource usage bars with color coding
- Action buttons with disabled states

### Create Container Form

- Name validation (alphanumeric, hyphens, underscores)
- Template selection (Claude Code, VS Code, Both)
- Mode selection (Interactive, Autonomous)
- Repository type (Empty folder, GitHub clone)
- Resource sliders (CPU, RAM, Disk)
- Zod schema validation

### Real-time Metrics

- Live CPU/Memory charts using Recharts
- 20 data points rolling window
- Color-coded based on usage percentage
- WebSocket updates every second

### Instruction Queue

- Add instructions to queue
- Status indicators (pending/running/completed/failed)
- Timestamps for tracking
- Result/error display
- Auto-refresh every 3 seconds

## Styling

### Tailwind Custom Classes

```css
.btn-primary      /* Primary action button */
.btn-secondary    /* Secondary action button */
.btn-danger       /* Destructive action button */
.card             /* Container card style */
.input            /* Form input style */
.label            /* Form label style */
.badge-*          /* Status badges with variants */
```

### Dark Mode

- Automatic dark mode support via CSS variables
- Follows system preference
- All components styled for both themes

## Error Handling

- API errors shown in UI with specific messages
- Loading states for all async operations
- Optimistic updates with rollback on error
- Form validation with field-level errors

## Performance

- Server Components for static content
- Code splitting with Next.js App Router
- Optimized package imports for Recharts/Zustand
- WebSocket connection reuse
- Debounced updates for metrics

## Browser Support

- Modern browsers (Chrome, Firefox, Safari, Edge)
- ES2020+ features
- WebSocket support required

## License

MIT
