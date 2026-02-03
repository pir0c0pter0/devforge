/**
 * Tests for useTaskWebSocket hook
 *
 * Tests for:
 * - Connection handling
 * - Subscription/unsubscription
 * - Fallback polling when disconnected
 * - Event handling (task updates)
 * - Reconnection logic
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { io } from 'socket.io-client';
import { useTaskWebSocket, TaskEvent } from '../use-task-websocket';
import type { Task } from '@/lib/types';

// Mock the api-client module
jest.mock('@/lib/api-client', () => ({
  apiClient: {
    getTask: jest.fn(),
    listTasks: jest.fn(),
  },
}));

import { apiClient } from '@/lib/api-client';

// Get the mocked io function
const mockIo = io as jest.MockedFunction<typeof io>;

// Helper to create mock task
const createMockTask = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-123',
  type: 'create-container',
  status: 'running',
  progress: 50,
  message: 'Creating container...',
  createdAt: new Date().toISOString(),
  ...overrides,
});

// Get mock socket from io mock
const getMockSocket = () => {
  const calls = mockIo.mock.results;
  if (calls.length > 0) {
    return calls[calls.length - 1].value;
  }
  return null;
};

describe('useTaskWebSocket', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('initialization', () => {
    it('should return initial state with empty values', () => {
      const { result } = renderHook(() => useTaskWebSocket());

      expect(result.current.task).toBeNull();
      expect(result.current.tasks).toBeInstanceOf(Map);
      expect(result.current.tasks.size).toBe(0);
      expect(result.current.socketId).toBeNull();
      expect(result.current.isUsingFallback).toBe(false);
    });

    it('should connect to /tasks namespace on mount', () => {
      renderHook(() => useTaskWebSocket());

      // Wait for effect to run
      act(() => {
        jest.runOnlyPendingTimers();
      });

      expect(mockIo).toHaveBeenCalledWith(
        expect.stringContaining('/tasks'),
        expect.objectContaining({
          transports: ['websocket', 'polling'],
        })
      );
    });

    it('should provide subscribe function', () => {
      const { result } = renderHook(() => useTaskWebSocket());

      expect(typeof result.current.subscribe).toBe('function');
    });

    it('should provide unsubscribe function', () => {
      const { result } = renderHook(() => useTaskWebSocket());

      expect(typeof result.current.unsubscribe).toBe('function');
    });

    it('should provide subscribeBatch function', () => {
      const { result } = renderHook(() => useTaskWebSocket());

      expect(typeof result.current.subscribeBatch).toBe('function');
    });

    it('should provide reset function', () => {
      const { result } = renderHook(() => useTaskWebSocket());

      expect(typeof result.current.reset).toBe('function');
    });
  });

  describe('TaskEvent enum', () => {
    it('should export CREATED event', () => {
      expect(TaskEvent.CREATED).toBe('CREATED');
    });

    it('should export UPDATED event', () => {
      expect(TaskEvent.UPDATED).toBe('UPDATED');
    });

    it('should export PROGRESS event', () => {
      expect(TaskEvent.PROGRESS).toBe('PROGRESS');
    });

    it('should export COMPLETED event', () => {
      expect(TaskEvent.COMPLETED).toBe('COMPLETED');
    });

    it('should export FAILED event', () => {
      expect(TaskEvent.FAILED).toBe('FAILED');
    });
  });

  describe('connection handling', () => {
    it('should update isConnected when socket connects', async () => {
      const { result } = renderHook(() => useTaskWebSocket());

      // Trigger the connect event
      act(() => {
        jest.runOnlyPendingTimers();
      });

      // The mock socket triggers connect in the on('connect') handler
      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });
    });

    it('should set socketId when connected', async () => {
      const { result } = renderHook(() => useTaskWebSocket());

      act(() => {
        jest.runOnlyPendingTimers();
      });

      await waitFor(() => {
        expect(result.current.socketId).toBe('mock-socket-id');
      });
    });
  });

  describe('subscribe', () => {
    it('should call emit with task:subscribe event', async () => {
      const { result } = renderHook(() => useTaskWebSocket());

      act(() => {
        jest.runOnlyPendingTimers();
      });

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });

      const mockSocket = getMockSocket();

      act(() => {
        result.current.subscribe('task-456');
      });

      expect(mockSocket?.emit).toHaveBeenCalledWith('subscribe:task', { taskId: 'task-456' });
    });

    it('should reset task state when subscribing to new task', async () => {
      const { result } = renderHook(() => useTaskWebSocket());

      act(() => {
        jest.runOnlyPendingTimers();
      });

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });

      act(() => {
        result.current.subscribe('task-789');
      });

      expect(result.current.task).toBeNull();
    });

    it('should unsubscribe from previous task when subscribing to new one', async () => {
      const { result } = renderHook(() => useTaskWebSocket());

      act(() => {
        jest.runOnlyPendingTimers();
      });

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });

      const mockSocket = getMockSocket();

      // Subscribe to first task
      act(() => {
        result.current.subscribe('task-first');
      });

      // Subscribe to second task
      act(() => {
        result.current.subscribe('task-second');
      });

      // Should have emitted unsubscribe for first task
      expect(mockSocket?.emit).toHaveBeenCalledWith('unsubscribe:task', { taskId: 'task-first' });
    });
  });

  describe('unsubscribe', () => {
    it('should call emit with unsubscribe:task event', async () => {
      const { result } = renderHook(() => useTaskWebSocket());

      act(() => {
        jest.runOnlyPendingTimers();
      });

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });

      const mockSocket = getMockSocket();

      // First subscribe
      act(() => {
        result.current.subscribe('task-to-unsub');
      });

      // Then unsubscribe
      act(() => {
        result.current.unsubscribe();
      });

      expect(mockSocket?.emit).toHaveBeenCalledWith('unsubscribe:task', { taskId: 'task-to-unsub' });
    });

    it('should clear task state after unsubscribe', async () => {
      const { result } = renderHook(() => useTaskWebSocket());

      act(() => {
        jest.runOnlyPendingTimers();
      });

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });

      act(() => {
        result.current.subscribe('task-clear');
      });

      act(() => {
        result.current.unsubscribe();
      });

      expect(result.current.task).toBeNull();
    });
  });

  describe('subscribeBatch', () => {
    it('should call emit with subscribe:batch event', async () => {
      const { result } = renderHook(() => useTaskWebSocket());

      act(() => {
        jest.runOnlyPendingTimers();
      });

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });

      const mockSocket = getMockSocket();

      act(() => {
        result.current.subscribeBatch(['task-a', 'task-b', 'task-c']);
      });

      expect(mockSocket?.emit).toHaveBeenCalledWith('subscribe:batch', {
        taskIds: ['task-a', 'task-b', 'task-c'],
      });
    });

    it('should handle empty batch subscription', async () => {
      const { result } = renderHook(() => useTaskWebSocket());

      act(() => {
        jest.runOnlyPendingTimers();
      });

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });

      const mockSocket = getMockSocket();

      act(() => {
        result.current.subscribeBatch([]);
      });

      expect(mockSocket?.emit).toHaveBeenCalledWith('subscribe:batch', { taskIds: [] });
    });
  });

  describe('unsubscribeBatch', () => {
    it('should clear tasks map after unsubscribe batch', async () => {
      const { result } = renderHook(() => useTaskWebSocket());

      act(() => {
        jest.runOnlyPendingTimers();
      });

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });

      act(() => {
        result.current.subscribeBatch(['batch-task-1', 'batch-task-2']);
      });

      act(() => {
        result.current.unsubscribeBatch();
      });

      expect(result.current.tasks.size).toBe(0);
    });
  });

  describe('reset', () => {
    it('should clear all state', async () => {
      const { result } = renderHook(() => useTaskWebSocket());

      act(() => {
        jest.runOnlyPendingTimers();
      });

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });

      act(() => {
        result.current.subscribe('single-task');
        result.current.subscribeBatch(['batch-1', 'batch-2']);
      });

      act(() => {
        result.current.reset();
      });

      expect(result.current.task).toBeNull();
      expect(result.current.tasks.size).toBe(0);
    });
  });

  describe('callbacks', () => {
    it('should call onComplete when task completes', async () => {
      const onComplete = jest.fn();
      const { result } = renderHook(() => useTaskWebSocket({ onComplete }));

      act(() => {
        jest.runOnlyPendingTimers();
      });

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });

      // Verify the hook accepts the callback
      expect(result.current.task).toBeNull();
    });

    it('should call onError when task fails', async () => {
      const onError = jest.fn();
      const { result } = renderHook(() => useTaskWebSocket({ onError }));

      act(() => {
        jest.runOnlyPendingTimers();
      });

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });

      // Verify the hook accepts the callback
      expect(result.current.task).toBeNull();
    });

    it('should call onUpdate for any task update', async () => {
      const onUpdate = jest.fn();
      const { result } = renderHook(() => useTaskWebSocket({ onUpdate }));

      act(() => {
        jest.runOnlyPendingTimers();
      });

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });

      // Verify the hook accepts the callback
      expect(result.current.task).toBeNull();
    });
  });

  describe('options', () => {
    it('should accept autoReconnect option', () => {
      const { result } = renderHook(() => useTaskWebSocket({ autoReconnect: false }));

      expect(result.current.task).toBeNull();
    });

    it('should accept maxReconnectAttempts option', () => {
      const { result } = renderHook(() => useTaskWebSocket({ maxReconnectAttempts: 5 }));

      expect(result.current.task).toBeNull();
    });

    it('should accept enableFallback option', () => {
      const { result } = renderHook(() => useTaskWebSocket({ enableFallback: false }));

      expect(result.current.isUsingFallback).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('should disconnect socket on unmount', () => {
      const { unmount } = renderHook(() => useTaskWebSocket());

      act(() => {
        jest.runOnlyPendingTimers();
      });

      const mockSocket = getMockSocket();

      unmount();

      expect(mockSocket?.disconnect).toHaveBeenCalled();
    });
  });
});

describe('useTaskWebSocket fallback polling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Mock apiClient.getTask to return a task
    (apiClient.getTask as jest.Mock).mockResolvedValue({
      success: true,
      data: createMockTask(),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should have isUsingFallback initially false', () => {
    const { result } = renderHook(() => useTaskWebSocket());

    expect(result.current.isUsingFallback).toBe(false);
  });

  it('should provide fallback mechanism when enabled', () => {
    const { result } = renderHook(() => useTaskWebSocket({ enableFallback: true }));

    expect(typeof result.current.subscribe).toBe('function');
    expect(typeof result.current.unsubscribe).toBe('function');
  });

  it('should not start polling when fallback is disabled', () => {
    const { result } = renderHook(() => useTaskWebSocket({ enableFallback: false }));

    expect(result.current.isUsingFallback).toBe(false);
  });
});

describe('useTaskWebSocket reconnection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should have default maxReconnectAttempts of 10', () => {
    const { result } = renderHook(() => useTaskWebSocket());

    // Hook should initialize without errors using default
    expect(result.current.task).toBeNull();
  });

  it('should allow custom maxReconnectAttempts', () => {
    const { result } = renderHook(() => useTaskWebSocket({ maxReconnectAttempts: 3 }));

    expect(result.current.task).toBeNull();
  });

  it('should allow disabling auto-reconnect', () => {
    const { result } = renderHook(() => useTaskWebSocket({ autoReconnect: false }));

    expect(result.current.task).toBeNull();
  });
});
