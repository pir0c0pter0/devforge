/**
 * Jest test setup for frontend tests
 */

import '@testing-library/jest-dom';

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    prefetch: jest.fn(),
    refresh: jest.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

// Mock environment variables
process.env.NEXT_PUBLIC_API_URL = 'http://localhost:8000';

// Mock Socket.io client
jest.mock('socket.io-client', () => {
  const mockSocket = {
    id: 'mock-socket-id',
    connected: false,
    on: jest.fn((event, callback) => {
      if (event === 'connect') {
        mockSocket.connected = true;
        setTimeout(() => callback(), 0);
      }
      return mockSocket;
    }),
    off: jest.fn(() => mockSocket),
    emit: jest.fn(() => mockSocket),
    disconnect: jest.fn(() => {
      mockSocket.connected = false;
      return mockSocket;
    }),
    connect: jest.fn(() => {
      mockSocket.connected = true;
      return mockSocket;
    }),
  };

  return {
    io: jest.fn(() => mockSocket),
  };
});

// Mock fetch globally
global.fetch = jest.fn();

// Mock window.WebSocket
Object.defineProperty(window, 'WebSocket', {
  value: class MockWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    readyState = MockWebSocket.OPEN;
    onopen: (() => void) | null = null;
    onclose: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onerror: ((error: Error) => void) | null = null;
    send = jest.fn();
    close = jest.fn();
    constructor() {
      setTimeout(() => this.onopen?.(), 0);
    }
  },
  writable: true,
});

// Suppress console.log during tests unless debugging
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeAll(() => {
  console.log = jest.fn();
  console.error = jest.fn();
  console.warn = jest.fn();
});

afterAll(() => {
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});
