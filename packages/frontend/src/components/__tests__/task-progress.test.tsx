/**
 * Tests for TaskProgress component
 *
 * Tests for:
 * - Rendering with different task states
 * - Loading state display
 * - Progress bar rendering
 * - Error state display
 * - Details section
 * - Connection status indicator
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { TaskProgress } from '../task-progress';
import type { Task } from '@/lib/types';

// Mock the useTaskWebSocket hook
jest.mock('@/hooks/use-task-websocket', () => ({
  useTaskWebSocket: jest.fn(),
  TaskEvent: {
    CREATED: 'CREATED',
    UPDATED: 'UPDATED',
    PROGRESS: 'PROGRESS',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED',
  },
}));

// Mock the AnimatedDots component
jest.mock('@/components/ui/animated-dots', () => ({
  AnimatedDots: ({ text }: { text: string }) => <span data-testid="animated-dots">{text}</span>,
}));

import { useTaskWebSocket } from '@/hooks/use-task-websocket';

const mockUseTaskWebSocket = useTaskWebSocket as jest.MockedFunction<typeof useTaskWebSocket>;

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

// Helper to create mock hook return value
const createMockHookReturn = (overrides: Partial<ReturnType<typeof useTaskWebSocket>> = {}) => ({
  task: null,
  tasks: new Map(),
  isConnected: true,
  socketId: 'mock-socket-id',
  isUsingFallback: false,
  subscribe: jest.fn(),
  unsubscribe: jest.fn(),
  subscribeBatch: jest.fn(),
  unsubscribeBatch: jest.fn(),
  reset: jest.fn(),
  ...overrides,
});

describe('TaskProgress', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('loading state', () => {
    it('should render loading state when task is null', () => {
      mockUseTaskWebSocket.mockReturnValue(createMockHookReturn({ task: null }));

      render(<TaskProgress taskId="task-123" />);

      expect(screen.getByTestId('animated-dots')).toBeInTheDocument();
      expect(screen.getByTestId('animated-dots')).toHaveTextContent('Connecting');
    });

    it('should show connected status when connected', () => {
      mockUseTaskWebSocket.mockReturnValue(createMockHookReturn({
        task: null,
        isConnected: true,
      }));

      render(<TaskProgress taskId="task-123" />);

      expect(screen.getByText('Connected')).toBeInTheDocument();
    });

    it('should show connecting status when not connected', () => {
      mockUseTaskWebSocket.mockReturnValue(createMockHookReturn({
        task: null,
        isConnected: false,
      }));

      render(<TaskProgress taskId="task-123" />);

      // There will be two "Connecting" texts - one from AnimatedDots, one from status
      const connectingElements = screen.getAllByText('Connecting');
      expect(connectingElements.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('pending status', () => {
    it('should render pending badge', () => {
      mockUseTaskWebSocket.mockReturnValue(createMockHookReturn({
        task: createMockTask({ status: 'pending', progress: 0 }),
      }));

      render(<TaskProgress taskId="task-123" />);

      expect(screen.getByText('Pending')).toBeInTheDocument();
    });

    it('should show 0% progress for pending task', () => {
      mockUseTaskWebSocket.mockReturnValue(createMockHookReturn({
        task: createMockTask({ status: 'pending', progress: 0 }),
      }));

      render(<TaskProgress taskId="task-123" />);

      expect(screen.getByText('0%')).toBeInTheDocument();
    });
  });

  describe('running status', () => {
    it('should render running badge', () => {
      mockUseTaskWebSocket.mockReturnValue(createMockHookReturn({
        task: createMockTask({ status: 'running', progress: 50 }),
      }));

      render(<TaskProgress taskId="task-123" />);

      expect(screen.getByText('Running')).toBeInTheDocument();
    });

    it('should show progress percentage', () => {
      mockUseTaskWebSocket.mockReturnValue(createMockHookReturn({
        task: createMockTask({ status: 'running', progress: 75 }),
      }));

      render(<TaskProgress taskId="task-123" />);

      expect(screen.getByText('75%')).toBeInTheDocument();
    });

    it('should display progress message', () => {
      mockUseTaskWebSocket.mockReturnValue(createMockHookReturn({
        task: createMockTask({
          status: 'running',
          progress: 50,
          message: 'Pulling Docker image...',
        }),
      }));

      render(<TaskProgress taskId="task-123" />);

      expect(screen.getByText('Pulling Docker image...')).toBeInTheDocument();
    });

    it('should show animated dots when running without message', () => {
      mockUseTaskWebSocket.mockReturnValue(createMockHookReturn({
        task: createMockTask({
          status: 'running',
          progress: 25,
          message: '',
        }),
      }));

      render(<TaskProgress taskId="task-123" />);

      expect(screen.getByTestId('animated-dots')).toHaveTextContent('Processing');
    });
  });

  describe('completed status', () => {
    it('should render completed badge', () => {
      mockUseTaskWebSocket.mockReturnValue(createMockHookReturn({
        task: createMockTask({
          status: 'completed',
          progress: 100,
          completedAt: new Date().toISOString(),
        }),
      }));

      render(<TaskProgress taskId="task-123" />);

      expect(screen.getByText('Completed')).toBeInTheDocument();
    });

    it('should show 100% progress for completed task', () => {
      mockUseTaskWebSocket.mockReturnValue(createMockHookReturn({
        task: createMockTask({
          status: 'completed',
          progress: 100,
        }),
      }));

      render(<TaskProgress taskId="task-123" />);

      expect(screen.getByText('100%')).toBeInTheDocument();
    });
  });

  describe('failed status', () => {
    it('should render failed badge', () => {
      mockUseTaskWebSocket.mockReturnValue(createMockHookReturn({
        task: createMockTask({
          status: 'failed',
          progress: 30,
          error: 'Docker daemon not running',
        }),
      }));

      render(<TaskProgress taskId="task-123" />);

      expect(screen.getByText('Failed')).toBeInTheDocument();
    });

    it('should display error message', () => {
      mockUseTaskWebSocket.mockReturnValue(createMockHookReturn({
        task: createMockTask({
          status: 'failed',
          progress: 30,
          error: 'Container creation failed: out of memory',
        }),
      }));

      render(<TaskProgress taskId="task-123" />);

      expect(screen.getByText('Container creation failed: out of memory')).toBeInTheDocument();
    });

    it('should show error label', () => {
      mockUseTaskWebSocket.mockReturnValue(createMockHookReturn({
        task: createMockTask({
          status: 'failed',
          error: 'Some error',
        }),
      }));

      render(<TaskProgress taskId="task-123" />);

      expect(screen.getByText('Error:')).toBeInTheDocument();
    });
  });

  describe('details section', () => {
    it('should not show details by default', () => {
      mockUseTaskWebSocket.mockReturnValue(createMockHookReturn({
        task: createMockTask(),
      }));

      render(<TaskProgress taskId="task-123" />);

      expect(screen.queryByText('Task ID:')).not.toBeInTheDocument();
    });

    it('should show details when showDetails is true', () => {
      mockUseTaskWebSocket.mockReturnValue(createMockHookReturn({
        task: createMockTask({ id: 'detailed-task-456' }),
      }));

      render(<TaskProgress taskId="detailed-task-456" showDetails={true} />);

      expect(screen.getByText('Task ID:')).toBeInTheDocument();
    });

    it('should show task type in details', () => {
      mockUseTaskWebSocket.mockReturnValue(createMockHookReturn({
        task: createMockTask({ type: 'clone-repo' }),
      }));

      render(<TaskProgress taskId="task-123" showDetails={true} />);

      expect(screen.getByText('Type:')).toBeInTheDocument();
      expect(screen.getByText('clone-repo')).toBeInTheDocument();
    });

    it('should show created time in details', () => {
      const createdAt = new Date().toISOString();
      mockUseTaskWebSocket.mockReturnValue(createMockHookReturn({
        task: createMockTask({ createdAt }),
      }));

      render(<TaskProgress taskId="task-123" showDetails={true} />);

      expect(screen.getByText('Created:')).toBeInTheDocument();
    });

    it('should show started time when available', () => {
      const startedAt = new Date().toISOString();
      mockUseTaskWebSocket.mockReturnValue(createMockHookReturn({
        task: createMockTask({ startedAt }),
      }));

      render(<TaskProgress taskId="task-123" showDetails={true} />);

      expect(screen.getByText('Started:')).toBeInTheDocument();
    });

    it('should show completed time when available', () => {
      const completedAt = new Date().toISOString();
      mockUseTaskWebSocket.mockReturnValue(createMockHookReturn({
        task: createMockTask({ status: 'completed', completedAt }),
      }));

      render(<TaskProgress taskId="task-123" showDetails={true} />);

      expect(screen.getByText('Completed:')).toBeInTheDocument();
    });

    it('should show WebSocket connection status in details', () => {
      mockUseTaskWebSocket.mockReturnValue(createMockHookReturn({
        task: createMockTask(),
        isConnected: true,
      }));

      render(<TaskProgress taskId="task-123" showDetails={true} />);

      expect(screen.getByText('WebSocket:')).toBeInTheDocument();
      // Find "Connected" in details section (there may be multiple)
      const connectedElements = screen.getAllByText('Connected');
      expect(connectedElements.length).toBeGreaterThanOrEqual(1);
    });

    it('should show disconnected status in details', () => {
      mockUseTaskWebSocket.mockReturnValue(createMockHookReturn({
        task: createMockTask(),
        isConnected: false,
      }));

      render(<TaskProgress taskId="task-123" showDetails={true} />);

      expect(screen.getByText('Disconnected')).toBeInTheDocument();
    });
  });

  describe('progress bar', () => {
    it('should render progress bar', () => {
      mockUseTaskWebSocket.mockReturnValue(createMockHookReturn({
        task: createMockTask({ progress: 50 }),
      }));

      const { container } = render(<TaskProgress taskId="task-123" />);

      // Find the progress bar container
      const progressBar = container.querySelector('.rounded-full.h-2.overflow-hidden');
      expect(progressBar).toBeInTheDocument();
    });

    it('should cap progress at 100%', () => {
      mockUseTaskWebSocket.mockReturnValue(createMockHookReturn({
        task: createMockTask({ progress: 150 }), // Over 100
      }));

      const { container } = render(<TaskProgress taskId="task-123" />);

      // Progress bar width should be capped at 100%
      const innerBar = container.querySelector('[style*="width: 100%"]');
      expect(innerBar).toBeInTheDocument();
    });
  });

  describe('subscription behavior', () => {
    it('should call subscribe with taskId on mount', () => {
      const subscribe = jest.fn();
      mockUseTaskWebSocket.mockReturnValue(createMockHookReturn({ subscribe }));

      render(<TaskProgress taskId="subscribe-test-123" />);

      // Wait for useEffect to run
      waitFor(() => {
        expect(subscribe).toHaveBeenCalledWith('subscribe-test-123');
      });
    });

    it('should call unsubscribe on unmount', () => {
      const unsubscribe = jest.fn();
      mockUseTaskWebSocket.mockReturnValue(createMockHookReturn({ unsubscribe }));

      const { unmount } = render(<TaskProgress taskId="unsub-test-456" />);

      unmount();

      expect(unsubscribe).toHaveBeenCalled();
    });

    it('should resubscribe when taskId changes', () => {
      const subscribe = jest.fn();
      mockUseTaskWebSocket.mockReturnValue(createMockHookReturn({ subscribe }));

      const { rerender } = render(<TaskProgress taskId="task-old" />);

      // Change taskId
      rerender(<TaskProgress taskId="task-new" />);

      waitFor(() => {
        expect(subscribe).toHaveBeenCalledWith('task-new');
      });
    });
  });

  describe('callbacks', () => {
    it('should pass onComplete callback to hook', () => {
      const onComplete = jest.fn();
      mockUseTaskWebSocket.mockReturnValue(createMockHookReturn());

      render(<TaskProgress taskId="task-123" onComplete={onComplete} />);

      expect(mockUseTaskWebSocket).toHaveBeenCalledWith(
        expect.objectContaining({ onComplete })
      );
    });

    it('should pass onError callback to hook', () => {
      const onError = jest.fn();
      mockUseTaskWebSocket.mockReturnValue(createMockHookReturn());

      render(<TaskProgress taskId="task-123" onError={onError} />);

      expect(mockUseTaskWebSocket).toHaveBeenCalledWith(
        expect.objectContaining({ onError })
      );
    });
  });

  describe('different task types', () => {
    it('should render create-container task', () => {
      mockUseTaskWebSocket.mockReturnValue(createMockHookReturn({
        task: createMockTask({ type: 'create-container' }),
      }));

      render(<TaskProgress taskId="task-123" showDetails={true} />);

      expect(screen.getByText('create-container')).toBeInTheDocument();
    });

    it('should render start-container task', () => {
      mockUseTaskWebSocket.mockReturnValue(createMockHookReturn({
        task: createMockTask({ type: 'start-container' }),
      }));

      render(<TaskProgress taskId="task-123" showDetails={true} />);

      expect(screen.getByText('start-container')).toBeInTheDocument();
    });

    it('should render clone-repo task', () => {
      mockUseTaskWebSocket.mockReturnValue(createMockHookReturn({
        task: createMockTask({ type: 'clone-repo' }),
      }));

      render(<TaskProgress taskId="task-123" showDetails={true} />);

      expect(screen.getByText('clone-repo')).toBeInTheDocument();
    });

    it('should render generic task', () => {
      mockUseTaskWebSocket.mockReturnValue(createMockHookReturn({
        task: createMockTask({ type: 'generic' }),
      }));

      render(<TaskProgress taskId="task-123" showDetails={true} />);

      expect(screen.getByText('generic')).toBeInTheDocument();
    });
  });

  describe('edge cases', () => {
    it('should handle task with no message in completed state', () => {
      mockUseTaskWebSocket.mockReturnValue(createMockHookReturn({
        task: createMockTask({ status: 'completed', message: '', progress: 100 }),
      }));

      render(<TaskProgress taskId="task-123" />);

      // When completed with no message, shows "Waiting..." fallback
      expect(screen.getByText('Waiting...')).toBeInTheDocument();
    });

    it('should show Processing for pending task with no message', () => {
      mockUseTaskWebSocket.mockReturnValue(createMockHookReturn({
        task: createMockTask({ status: 'pending', message: '', progress: 0 }),
      }));

      render(<TaskProgress taskId="task-123" />);

      // When pending/running with no message, shows "Processing" with AnimatedDots
      expect(screen.getByTestId('animated-dots')).toHaveTextContent('Processing');
    });

    it('should handle task with very long message', () => {
      const longMessage = 'A'.repeat(500);
      mockUseTaskWebSocket.mockReturnValue(createMockHookReturn({
        task: createMockTask({ message: longMessage }),
      }));

      render(<TaskProgress taskId="task-123" />);

      // Message should be rendered (may be truncated by CSS)
      expect(screen.getByText(longMessage)).toBeInTheDocument();
    });

    it('should handle empty taskId gracefully', () => {
      mockUseTaskWebSocket.mockReturnValue(createMockHookReturn({ task: null }));

      // Should not throw
      expect(() => render(<TaskProgress taskId="" />)).not.toThrow();
    });
  });
});
