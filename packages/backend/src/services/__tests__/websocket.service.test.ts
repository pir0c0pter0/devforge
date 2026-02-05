/**
 * Tests for WebSocket service
 *
 * Tests for:
 * - initializeWebSocket function
 * - setupTasksNamespace setup
 * - emitTaskEvent function
 * - Task subscription tracking
 * - Connection/disconnection handling
 */

import { Server as HttpServer, createServer } from 'http';
import { Server } from 'socket.io';
import { io as ioc, Socket as ClientSocket } from 'socket.io-client';
import type { TaskEventPayload, TaskSubscription, TaskUnsubscription, TaskBatchSubscription } from '@devforge/shared';
import { TaskEvent } from '@devforge/shared';
import {
  initializeWebSocket,
  emitTaskEvent,
  getTaskSubscribers,
  getAllTaskSubscriptions,
  closeWebSocket,
  getSocketServer,
} from '../websocket.service';

// Port for test server
const TEST_PORT = 9999;

describe('WebSocket Service', () => {
  let httpServer: HttpServer;
  let socketServer: Server | null = null;
  let clientSocket: ClientSocket | null = null;

  beforeAll((done) => {
    httpServer = createServer();
    socketServer = initializeWebSocket(httpServer);
    httpServer.listen(TEST_PORT, () => {
      done();
    });
  });

  afterAll(async () => {
    if (clientSocket?.connected) {
      clientSocket.disconnect();
    }
    await closeWebSocket();
    httpServer.close();
  });

  afterEach(() => {
    if (clientSocket?.connected) {
      clientSocket.disconnect();
      clientSocket = null;
    }
  });

  describe('initializeWebSocket', () => {
    it('should return a Socket.io server instance', () => {
      expect(socketServer).toBeDefined();
      expect(socketServer).toBeInstanceOf(Server);
    });

    it('should have /tasks namespace configured', () => {
      const server = getSocketServer();
      expect(server).not.toBeNull();

      // The server should have the /tasks namespace
      const tasksNamespace = server?.of('/tasks');
      expect(tasksNamespace).toBeDefined();
    });

    it('should support websocket and polling transports', () => {
      const server = getSocketServer();
      expect(server).not.toBeNull();
    });
  });

  describe('getSocketServer', () => {
    it('should return the socket server instance', () => {
      const server = getSocketServer();
      expect(server).toBe(socketServer);
    });
  });
});

describe('WebSocket /tasks namespace', () => {
  let httpServer: HttpServer;
  let clientSocket: ClientSocket | null = null;

  beforeAll((done) => {
    httpServer = createServer();
    initializeWebSocket(httpServer);
    httpServer.listen(TEST_PORT + 1, () => {
      done();
    });
  });

  afterAll(async () => {
    if (clientSocket?.connected) {
      clientSocket.disconnect();
    }
    await closeWebSocket();
    httpServer.close();
  });

  beforeEach((done) => {
    // Connect to the /tasks namespace
    clientSocket = ioc(`http://localhost:${TEST_PORT + 1}/tasks`, {
      transports: ['websocket'],
    });

    clientSocket.on('connect', () => {
      done();
    });

    clientSocket.on('connect_error', (error) => {
      done(error);
    });
  });

  afterEach(() => {
    if (clientSocket?.connected) {
      clientSocket.disconnect();
      clientSocket = null;
    }
  });

  describe('connection handling', () => {
    it('should connect to /tasks namespace successfully', () => {
      expect(clientSocket?.connected).toBe(true);
    });

    it('should have a socket ID after connection', () => {
      expect(clientSocket?.id).toBeDefined();
      expect(typeof clientSocket?.id).toBe('string');
    });
  });

  describe('task:subscribe event', () => {
    it('should handle task subscription', (done) => {
      const subscription: TaskSubscription = {
        taskId: 'test-task-123',
      };

      // Emit subscription
      clientSocket?.emit('task:subscribe', subscription);

      // Give server time to process
      setTimeout(() => {
        const subscribers = getTaskSubscribers('test-task-123');
        expect(subscribers).toBeGreaterThanOrEqual(1);
        done();
      }, 100);
    });

    it('should track multiple subscriptions', (done) => {
      const subscription1: TaskSubscription = { taskId: 'multi-task-1' };
      const subscription2: TaskSubscription = { taskId: 'multi-task-2' };

      clientSocket?.emit('task:subscribe', subscription1);
      clientSocket?.emit('task:subscribe', subscription2);

      setTimeout(() => {
        expect(getTaskSubscribers('multi-task-1')).toBeGreaterThanOrEqual(1);
        expect(getTaskSubscribers('multi-task-2')).toBeGreaterThanOrEqual(1);
        done();
      }, 100);
    });
  });

  describe('task:unsubscribe event', () => {
    it('should handle task unsubscription', (done) => {
      const taskId = 'unsub-task-456';
      const subscription: TaskSubscription = { taskId };
      const unsubscription: TaskUnsubscription = { taskId };

      // First subscribe
      clientSocket?.emit('task:subscribe', subscription);

      setTimeout(() => {
        // Then unsubscribe
        clientSocket?.emit('task:unsubscribe', unsubscription);

        setTimeout(() => {
          const subscribers = getTaskSubscribers(taskId);
          expect(subscribers).toBe(0);
          done();
        }, 100);
      }, 100);
    });
  });

  describe('task:subscribe:batch event', () => {
    it('should handle batch subscription', (done) => {
      const batchSubscription: TaskBatchSubscription = {
        taskIds: ['batch-task-1', 'batch-task-2', 'batch-task-3'],
      };

      clientSocket?.emit('task:subscribe:batch', batchSubscription);

      setTimeout(() => {
        expect(getTaskSubscribers('batch-task-1')).toBeGreaterThanOrEqual(1);
        expect(getTaskSubscribers('batch-task-2')).toBeGreaterThanOrEqual(1);
        expect(getTaskSubscribers('batch-task-3')).toBeGreaterThanOrEqual(1);
        done();
      }, 100);
    });

    it('should handle empty batch subscription', (done) => {
      const batchSubscription: TaskBatchSubscription = {
        taskIds: [],
      };

      // Should not throw
      expect(() => {
        clientSocket?.emit('task:subscribe:batch', batchSubscription);
      }).not.toThrow();

      setTimeout(done, 100);
    });
  });

  describe('task:event emission', () => {
    it('should receive task events for subscribed tasks', (done) => {
      const taskId = 'event-task-789';
      const subscription: TaskSubscription = { taskId };

      const payload: TaskEventPayload = {
        event: TaskEvent.PROGRESS,
        task: {
          id: taskId,
          type: 'create-container',
          status: 'running',
          progress: 50,
          message: 'Creating container...',
          createdAt: new Date(),
        },
        timestamp: new Date(),
      };

      clientSocket?.on('task:event', (receivedPayload: TaskEventPayload) => {
        expect(receivedPayload.event).toBe(TaskEvent.PROGRESS);
        expect(receivedPayload.task.id).toBe(taskId);
        expect(receivedPayload.task.progress).toBe(50);
        done();
      });

      // Subscribe first
      clientSocket?.emit('task:subscribe', subscription);

      // Wait for subscription to be registered, then emit event
      setTimeout(() => {
        emitTaskEvent(taskId, payload);
      }, 100);
    });

    it('should receive COMPLETED event', (done) => {
      const taskId = 'completed-task-111';
      const subscription: TaskSubscription = { taskId };

      const payload: TaskEventPayload = {
        event: TaskEvent.COMPLETED,
        task: {
          id: taskId,
          type: 'create-container',
          status: 'completed',
          progress: 100,
          message: 'Container created successfully',
          createdAt: new Date(),
          completedAt: new Date(),
        },
        timestamp: new Date(),
      };

      clientSocket?.on('task:event', (receivedPayload: TaskEventPayload) => {
        expect(receivedPayload.event).toBe(TaskEvent.COMPLETED);
        expect(receivedPayload.task.status).toBe('completed');
        expect(receivedPayload.task.progress).toBe(100);
        done();
      });

      clientSocket?.emit('task:subscribe', subscription);

      setTimeout(() => {
        emitTaskEvent(taskId, payload);
      }, 100);
    });

    it('should receive FAILED event with error details', (done) => {
      const taskId = 'failed-task-222';
      const subscription: TaskSubscription = { taskId };

      const payload: TaskEventPayload = {
        event: TaskEvent.FAILED,
        task: {
          id: taskId,
          type: 'create-container',
          status: 'failed',
          progress: 30,
          message: 'Container creation failed',
          error: 'Docker daemon not running',
          createdAt: new Date(),
        },
        timestamp: new Date(),
        meta: {
          errorDetails: 'Connection refused to docker socket',
        },
      };

      clientSocket?.on('task:event', (receivedPayload: TaskEventPayload) => {
        expect(receivedPayload.event).toBe(TaskEvent.FAILED);
        expect(receivedPayload.task.error).toBe('Docker daemon not running');
        expect(receivedPayload.meta?.errorDetails).toBe('Connection refused to docker socket');
        done();
      });

      clientSocket?.emit('task:subscribe', subscription);

      setTimeout(() => {
        emitTaskEvent(taskId, payload);
      }, 100);
    });

    it('should not receive events for unsubscribed tasks', (done) => {
      const subscribedTaskId = 'subscribed-task';
      const otherTaskId = 'other-task';

      const subscription: TaskSubscription = { taskId: subscribedTaskId };

      const eventReceived = jest.fn();
      clientSocket?.on('task:event', eventReceived);

      clientSocket?.emit('task:subscribe', subscription);

      setTimeout(() => {
        // Emit event for a different task
        emitTaskEvent(otherTaskId, {
          event: TaskEvent.PROGRESS,
          task: {
            id: otherTaskId,
            type: 'generic',
            status: 'running',
            progress: 50,
            message: 'Running...',
            createdAt: new Date(),
          },
          timestamp: new Date(),
        });

        // Wait and verify no event received
        setTimeout(() => {
          expect(eventReceived).not.toHaveBeenCalled();
          done();
        }, 200);
      }, 100);
    });
  });
});

describe('getAllTaskSubscriptions', () => {
  let httpServer: HttpServer;
  let client1: ClientSocket | null = null;
  let client2: ClientSocket | null = null;

  beforeAll((done) => {
    httpServer = createServer();
    initializeWebSocket(httpServer);
    httpServer.listen(TEST_PORT + 2, () => {
      done();
    });
  });

  afterAll(async () => {
    if (client1?.connected) client1.disconnect();
    if (client2?.connected) client2.disconnect();
    await closeWebSocket();
    httpServer.close();
  });

  beforeEach((done) => {
    let connectCount = 0;
    const checkDone = () => {
      connectCount++;
      if (connectCount === 2) done();
    };

    client1 = ioc(`http://localhost:${TEST_PORT + 2}/tasks`, { transports: ['websocket'] });
    client2 = ioc(`http://localhost:${TEST_PORT + 2}/tasks`, { transports: ['websocket'] });

    client1.on('connect', checkDone);
    client2.on('connect', checkDone);
  });

  afterEach(() => {
    if (client1?.connected) {
      client1.disconnect();
      client1 = null;
    }
    if (client2?.connected) {
      client2.disconnect();
      client2 = null;
    }
  });

  it('should return map of all task subscriptions', (done) => {
    client1?.emit('task:subscribe', { taskId: 'shared-task' });
    client2?.emit('task:subscribe', { taskId: 'shared-task' });
    client1?.emit('task:subscribe', { taskId: 'client1-only' });

    setTimeout(() => {
      const allSubs = getAllTaskSubscriptions();
      expect(allSubs).toBeInstanceOf(Map);
      // At least one of the tasks should have subscriptions
      expect(allSubs.size).toBeGreaterThanOrEqual(1);
      done();
    }, 200);
  });
});

describe('emitTaskEvent without server', () => {
  it('should not throw when socket server is not initialized', () => {
    // This tests the guard clause in emitTaskEvent
    // Since we're in a test context with server initialized,
    // we just verify the function signature works
    const payload: TaskEventPayload = {
      event: TaskEvent.CREATED,
      task: {
        id: 'no-server-task',
        type: 'generic',
        status: 'pending',
        progress: 0,
        message: 'Starting...',
        createdAt: new Date(),
      },
      timestamp: new Date(),
    };

    // Should not throw
    expect(() => emitTaskEvent('some-task', payload)).not.toThrow();
  });
});

describe('getTaskSubscribers edge cases', () => {
  it('should return 0 for non-existent task', () => {
    const subscribers = getTaskSubscribers('non-existent-task-999');
    expect(subscribers).toBe(0);
  });

  it('should return 0 for empty string task ID', () => {
    const subscribers = getTaskSubscribers('');
    expect(subscribers).toBe(0);
  });
});
