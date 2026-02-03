/**
 * Tests for WebSocket types
 *
 * Tests for:
 * - TaskEvent enum values
 * - TaskEventPayload interface structure
 * - TaskSubscription types
 */

import { TaskEvent } from '../types/websocket';
import type {
  TaskEventPayload,
  TaskSubscription,
  TaskUnsubscription,
  TaskTypeSubscription,
  TaskBatchSubscription,
  TaskEventHandler,
} from '../types/websocket';
import type { Task, TaskStatus, TaskType } from '../types/task.types';

describe('TaskEvent enum', () => {
  it('should have CREATED event', () => {
    expect(TaskEvent.CREATED).toBe('CREATED');
  });

  it('should have UPDATED event', () => {
    expect(TaskEvent.UPDATED).toBe('UPDATED');
  });

  it('should have PROGRESS event', () => {
    expect(TaskEvent.PROGRESS).toBe('PROGRESS');
  });

  it('should have COMPLETED event', () => {
    expect(TaskEvent.COMPLETED).toBe('COMPLETED');
  });

  it('should have FAILED event', () => {
    expect(TaskEvent.FAILED).toBe('FAILED');
  });

  it('should have exactly 5 event types', () => {
    const eventValues = Object.values(TaskEvent);
    expect(eventValues).toHaveLength(5);
  });

  it('should contain all expected event types', () => {
    const expectedEvents = ['CREATED', 'UPDATED', 'PROGRESS', 'COMPLETED', 'FAILED'];
    const actualEvents = Object.values(TaskEvent);
    expect(actualEvents).toEqual(expect.arrayContaining(expectedEvents));
  });
});

describe('TaskEventPayload interface', () => {
  const createMockTask = (overrides: Partial<Task> = {}): Task => ({
    id: 'task-123',
    type: 'create-container' as TaskType,
    status: 'running' as TaskStatus,
    progress: 50,
    message: 'Creating container...',
    createdAt: new Date(),
    ...overrides,
  });

  it('should accept valid payload with required fields', () => {
    const payload: TaskEventPayload = {
      event: TaskEvent.CREATED,
      task: createMockTask(),
      timestamp: new Date(),
    };

    expect(payload.event).toBe(TaskEvent.CREATED);
    expect(payload.task.id).toBe('task-123');
    expect(payload.timestamp).toBeInstanceOf(Date);
  });

  it('should accept payload with meta containing previousStatus', () => {
    const payload: TaskEventPayload = {
      event: TaskEvent.UPDATED,
      task: createMockTask({ status: 'running' }),
      timestamp: new Date(),
      meta: {
        previousStatus: 'pending',
      },
    };

    expect(payload.meta?.previousStatus).toBe('pending');
  });

  it('should accept payload with meta containing errorDetails', () => {
    const payload: TaskEventPayload = {
      event: TaskEvent.FAILED,
      task: createMockTask({ status: 'failed', error: 'Connection refused' }),
      timestamp: new Date(),
      meta: {
        errorDetails: 'Docker daemon not running',
      },
    };

    expect(payload.meta?.errorDetails).toBe('Docker daemon not running');
  });

  it('should accept payload with meta containing estimatedTimeRemaining', () => {
    const payload: TaskEventPayload = {
      event: TaskEvent.PROGRESS,
      task: createMockTask({ progress: 75 }),
      timestamp: new Date(),
      meta: {
        estimatedTimeRemaining: 30000, // 30 seconds
      },
    };

    expect(payload.meta?.estimatedTimeRemaining).toBe(30000);
  });

  it('should accept payload with all meta fields', () => {
    const payload: TaskEventPayload = {
      event: TaskEvent.UPDATED,
      task: createMockTask(),
      timestamp: new Date(),
      meta: {
        previousStatus: 'pending',
        errorDetails: 'Warning: low disk space',
        estimatedTimeRemaining: 15000,
      },
    };

    expect(payload.meta?.previousStatus).toBe('pending');
    expect(payload.meta?.errorDetails).toBe('Warning: low disk space');
    expect(payload.meta?.estimatedTimeRemaining).toBe(15000);
  });
});

describe('TaskSubscription interface', () => {
  it('should accept subscription with taskId only', () => {
    const subscription: TaskSubscription = {
      taskId: 'task-456',
    };

    expect(subscription.taskId).toBe('task-456');
    expect(subscription.events).toBeUndefined();
  });

  it('should accept subscription with specific events filter', () => {
    const subscription: TaskSubscription = {
      taskId: 'task-789',
      events: [TaskEvent.PROGRESS, TaskEvent.COMPLETED],
    };

    expect(subscription.taskId).toBe('task-789');
    expect(subscription.events).toHaveLength(2);
    expect(subscription.events).toContain(TaskEvent.PROGRESS);
    expect(subscription.events).toContain(TaskEvent.COMPLETED);
  });

  it('should accept subscription with all events', () => {
    const subscription: TaskSubscription = {
      taskId: 'task-abc',
      events: [
        TaskEvent.CREATED,
        TaskEvent.UPDATED,
        TaskEvent.PROGRESS,
        TaskEvent.COMPLETED,
        TaskEvent.FAILED,
      ],
    };

    expect(subscription.events).toHaveLength(5);
  });
});

describe('TaskUnsubscription interface', () => {
  it('should accept unsubscription with taskId', () => {
    const unsubscription: TaskUnsubscription = {
      taskId: 'task-to-unsub',
    };

    expect(unsubscription.taskId).toBe('task-to-unsub');
  });
});

describe('TaskTypeSubscription interface', () => {
  it('should accept subscription with taskType only', () => {
    const subscription: TaskTypeSubscription = {
      taskType: 'create-container',
    };

    expect(subscription.taskType).toBe('create-container');
    expect(subscription.events).toBeUndefined();
  });

  it('should accept subscription with taskType and events filter', () => {
    const subscription: TaskTypeSubscription = {
      taskType: 'clone-repo',
      events: [TaskEvent.PROGRESS, TaskEvent.FAILED],
    };

    expect(subscription.taskType).toBe('clone-repo');
    expect(subscription.events).toContain(TaskEvent.PROGRESS);
  });

  it('should accept all valid task types', () => {
    const taskTypes: TaskType[] = ['create-container', 'start-container', 'clone-repo', 'generic'];

    taskTypes.forEach((taskType) => {
      const subscription: TaskTypeSubscription = { taskType };
      expect(subscription.taskType).toBe(taskType);
    });
  });
});

describe('TaskBatchSubscription interface', () => {
  it('should accept batch subscription with taskIds array', () => {
    const subscription: TaskBatchSubscription = {
      taskIds: ['task-1', 'task-2', 'task-3'],
    };

    expect(subscription.taskIds).toHaveLength(3);
    expect(subscription.taskIds).toContain('task-2');
  });

  it('should accept batch subscription with events filter', () => {
    const subscription: TaskBatchSubscription = {
      taskIds: ['task-a', 'task-b'],
      events: [TaskEvent.COMPLETED, TaskEvent.FAILED],
    };

    expect(subscription.taskIds).toHaveLength(2);
    expect(subscription.events).toHaveLength(2);
  });

  it('should accept empty taskIds array', () => {
    const subscription: TaskBatchSubscription = {
      taskIds: [],
    };

    expect(subscription.taskIds).toHaveLength(0);
  });

  it('should accept large batch of taskIds', () => {
    const taskIds = Array.from({ length: 100 }, (_, i) => `task-${i}`);
    const subscription: TaskBatchSubscription = {
      taskIds,
    };

    expect(subscription.taskIds).toHaveLength(100);
  });
});

describe('TaskEventHandler type', () => {
  it('should be a function that accepts TaskEventPayload', () => {
    const handler: TaskEventHandler = (payload) => {
      expect(payload.event).toBeDefined();
      expect(payload.task).toBeDefined();
    };

    const mockPayload: TaskEventPayload = {
      event: TaskEvent.CREATED,
      task: {
        id: 'test-task',
        type: 'generic',
        status: 'pending',
        progress: 0,
        message: 'Starting...',
        createdAt: new Date(),
      },
      timestamp: new Date(),
    };

    // Should not throw
    expect(() => handler(mockPayload)).not.toThrow();
  });

  it('should allow async handlers', async () => {
    const asyncHandler: TaskEventHandler = async (payload) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return payload.task.id;
    };

    const mockPayload: TaskEventPayload = {
      event: TaskEvent.COMPLETED,
      task: {
        id: 'async-task',
        type: 'generic',
        status: 'completed',
        progress: 100,
        message: 'Done',
        createdAt: new Date(),
      },
      timestamp: new Date(),
    };

    const result = await asyncHandler(mockPayload);
    expect(result).toBe('async-task');
  });
});
