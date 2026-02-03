import { z } from 'zod';

/**
 * Instruction status types
 */
export const InstructionStatusSchema = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled'
]);
export type InstructionStatus = z.infer<typeof InstructionStatusSchema>;

/**
 * Instruction priority levels
 */
export const InstructionPrioritySchema = z.enum([
  'low',
  'normal',
  'high',
  'critical'
]);
export type InstructionPriority = z.infer<typeof InstructionPrioritySchema>;

/**
 * Instruction queue item schema
 */
export const InstructionSchema = z.object({
  id: z.string(),

  containerId: z.string()
    .min(1, 'Container ID is required'),

  instruction: z.string()
    .min(1, 'Instruction text is required')
    .max(10000, 'Instruction text must be less than 10000 characters'),

  status: InstructionStatusSchema,

  priority: InstructionPrioritySchema.default('normal'),

  createdAt: z.date(),

  updatedAt: z.date(),

  startedAt: z.date().optional(),

  completedAt: z.date().optional(),

  failedAt: z.date().optional(),

  result: z.object({
    exitCode: z.number().optional(),
    stdout: z.string().optional(),
    stderr: z.string().optional(),
    error: z.string().optional(),
    output: z.string().optional(),
  }).optional(),

  metadata: z.record(z.unknown()).optional(),

  retryCount: z.number().default(0),

  maxRetries: z.number().default(3),

  timeout: z.number().optional(), // in milliseconds
});

export type Instruction = z.infer<typeof InstructionSchema>;

/**
 * Create instruction request
 */
export const CreateInstructionRequestSchema = z.object({
  containerId: z.string()
    .min(1, 'Container ID is required'),

  instruction: z.string()
    .min(1, 'Instruction text is required')
    .max(10000, 'Instruction text must be less than 10000 characters'),

  priority: InstructionPrioritySchema.optional().default('normal'),

  timeout: z.number()
    .min(1000, 'Timeout must be at least 1 second')
    .max(3600000, 'Timeout cannot exceed 1 hour')
    .optional(),

  metadata: z.record(z.unknown()).optional(),
});

export type CreateInstructionRequest = z.infer<typeof CreateInstructionRequestSchema>;

/**
 * Update instruction request
 */
export const UpdateInstructionRequestSchema = z.object({
  status: InstructionStatusSchema.optional(),

  priority: InstructionPrioritySchema.optional(),

  result: z.object({
    exitCode: z.number().optional(),
    stdout: z.string().optional(),
    stderr: z.string().optional(),
    error: z.string().optional(),
    output: z.string().optional(),
  }).optional(),

  metadata: z.record(z.unknown()).optional(),
});

export type UpdateInstructionRequest = z.infer<typeof UpdateInstructionRequestSchema>;

/**
 * Instruction execution result
 */
export const InstructionResultSchema = z.object({
  instructionId: z.string(),
  containerId: z.string(),
  status: InstructionStatusSchema,
  exitCode: z.number().optional(),
  stdout: z.string().optional(),
  stderr: z.string().optional(),
  error: z.string().optional(),
  output: z.string().optional(),
  duration: z.number(), // in milliseconds
  completedAt: z.date(),
});

export type InstructionResult = z.infer<typeof InstructionResultSchema>;

/**
 * Instruction queue stats
 */
export const InstructionQueueStatsSchema = z.object({
  containerId: z.string(),
  pending: z.number(),
  running: z.number(),
  completed: z.number(),
  failed: z.number(),
  total: z.number(),
});

export type InstructionQueueStats = z.infer<typeof InstructionQueueStatsSchema>;

/**
 * Bulk instruction creation
 */
export const BulkCreateInstructionsRequestSchema = z.object({
  containerId: z.string()
    .min(1, 'Container ID is required'),

  instructions: z.array(
    z.object({
      instruction: z.string()
        .min(1, 'Instruction text is required')
        .max(10000, 'Instruction text must be less than 10000 characters'),
      priority: InstructionPrioritySchema.optional().default('normal'),
      timeout: z.number().optional(),
      metadata: z.record(z.unknown()).optional(),
    })
  ).min(1, 'At least one instruction is required')
    .max(100, 'Cannot create more than 100 instructions at once'),
});

export type BulkCreateInstructionsRequest = z.infer<typeof BulkCreateInstructionsRequestSchema>;
