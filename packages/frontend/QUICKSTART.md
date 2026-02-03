# Quick Start Guide

## Installation

```bash
cd packages/frontend
pnpm install
```

## Configuration

Create `.env.local` file:

```bash
cp .env.example .env.local
```

Edit if needed (defaults to localhost:3001):

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3001
```

## Development

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000)

## Production Build

```bash
pnpm build
pnpm start
```

## Type Checking

```bash
pnpm type-check
```

## Project Structure

```
src/
├── app/              # Pages (Next.js App Router)
├── components/       # React components
├── hooks/           # Custom hooks
├── lib/             # API client, WebSocket, types
└── stores/          # Zustand state management
```

## Key Pages

- `/` - Dashboard home
- `/containers` - Container list
- `/containers/new` - Create container
- `/containers/[id]` - Container details

## Available Scripts

- `pnpm dev` - Start development server
- `pnpm build` - Build for production
- `pnpm start` - Start production server
- `pnpm lint` - Run ESLint
- `pnpm type-check` - TypeScript type checking

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001` | Backend API URL |
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:3001` | WebSocket URL |

## Features

- Real-time container monitoring
- WebSocket metrics updates
- Create/Start/Stop/Delete containers
- Instruction queue management
- Responsive UI with dark mode
- Form validation with Zod
- Type-safe with TypeScript

## Troubleshooting

### Port already in use

```bash
# Change port
PORT=3001 pnpm dev
```

### Can't connect to backend

Check that:
1. Backend is running on port 3001
2. `.env.local` has correct API_URL
3. No CORS issues (backend should allow localhost:3000)

### TypeScript errors

```bash
# Clean build cache
rm -rf .next
pnpm type-check
```

### WebSocket not connecting

1. Check WebSocket URL in `.env.local`
2. Verify backend WebSocket server is running
3. Check browser console for connection errors

## Production Deployment

### Docker

Build standalone Next.js app:

```bash
pnpm build
```

Output will be in `.next/standalone/`

### Environment Variables

Set in production:

```bash
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
NEXT_PUBLIC_WS_URL=wss://api.yourdomain.com
```

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- WebSocket support required
