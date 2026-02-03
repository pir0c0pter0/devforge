import { z } from 'zod';

/**
 * Container template types
 */
export const ContainerTemplateSchema = z.enum(['claude', 'vscode', 'both']);
export type ContainerTemplate = z.infer<typeof ContainerTemplateSchema>;

/**
 * Container mode types
 */
export const ContainerModeSchema = z.enum(['interactive', 'autonomous']);
export type ContainerMode = z.infer<typeof ContainerModeSchema>;

/**
 * Repository type for container initialization
 */
export const RepoTypeSchema = z.enum(['empty', 'clone']);
export type RepoType = z.infer<typeof RepoTypeSchema>;

/**
 * Container status
 */
export const ContainerStatusSchema = z.enum([
  'creating',
  'running',
  'stopped',
  'paused',
  'restarting',
  'removing',
  'exited',
  'dead'
]);
export type ContainerStatus = z.infer<typeof ContainerStatusSchema>;

/**
 * Container configuration schema with Zod validation
 */
export const ContainerConfigSchema = z.object({
  name: z.string()
    .min(1, 'Container name is required')
    .max(100, 'Container name must be less than 100 characters')
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/, 'Container name must start with alphanumeric and contain only alphanumeric, underscore, dot, or hyphen'),

  template: ContainerTemplateSchema,

  mode: ContainerModeSchema,

  repoUrl: z.string()
    .url('Repository URL must be a valid URL')
    .optional()
    .or(z.literal('')),

  repoType: RepoTypeSchema,

  sshKeyPath: z.string()
    .optional()
    .refine(
      (path) => !path || path.startsWith('/') || path.startsWith('~'),
      'SSH key path must be an absolute path'
    ),

  cpuLimit: z.number()
    .min(0.1, 'CPU limit must be at least 0.1 cores')
    .max(32, 'CPU limit cannot exceed 32 cores')
    .default(2),

  memoryLimit: z.number()
    .min(128, 'Memory limit must be at least 128 MB')
    .max(32768, 'Memory limit cannot exceed 32 GB')
    .default(2048), // in MB

  diskLimit: z.number()
    .min(1024, 'Disk limit must be at least 1 GB')
    .max(102400, 'Disk limit cannot exceed 100 GB')
    .default(10240), // in MB
}).refine(
  (data) => {
    // If repoType is 'clone', repoUrl must be provided
    if (data.repoType === 'clone' && !data.repoUrl) {
      return false;
    }
    return true;
  },
  {
    message: 'Repository URL is required when repository type is "clone"',
    path: ['repoUrl']
  }
);

export type ContainerConfig = z.infer<typeof ContainerConfigSchema>;

/**
 * Complete container data including Docker metadata
 */
export const ContainerSchema = z.object({
  id: z.string(),
  dockerId: z.string(),
  name: z.string(),
  template: ContainerTemplateSchema,
  mode: ContainerModeSchema,
  repoUrl: z.string().optional(),
  repoType: RepoTypeSchema,
  sshKeyPath: z.string().optional(),
  cpuLimit: z.number(),
  memoryLimit: z.number(),
  diskLimit: z.number(),
  status: ContainerStatusSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
  startedAt: z.date().optional(),
  stoppedAt: z.date().optional(),
});

export type Container = z.infer<typeof ContainerSchema>;

/**
 * Container creation request
 */
export const CreateContainerRequestSchema = ContainerConfigSchema;
export type CreateContainerRequest = z.infer<typeof CreateContainerRequestSchema>;

/**
 * Container metrics data
 */
export const ContainerMetricsSchema = z.object({
  containerId: z.string(),
  timestamp: z.date(),
  cpu: z.object({
    usage: z.number(), // percentage
    limit: z.number(), // cores
  }),
  memory: z.object({
    usage: z.number(), // MB
    limit: z.number(), // MB
    percentage: z.number(),
  }),
  disk: z.object({
    usage: z.number(), // MB
    limit: z.number(), // MB
    percentage: z.number(),
  }),
  network: z.object({
    rxBytes: z.number(),
    txBytes: z.number(),
  }).optional(),
  activeAgents: z.array(z.object({
    pid: z.number(),
    command: z.string(),
    cpu: z.number(),
    memory: z.number(),
  })),
});

export type ContainerMetrics = z.infer<typeof ContainerMetricsSchema>;

/**
 * Container list response item
 */
export const ContainerListItemSchema = z.object({
  id: z.string(),
  dockerId: z.string(),
  name: z.string(),
  template: ContainerTemplateSchema,
  mode: ContainerModeSchema,
  status: ContainerStatusSchema,
  createdAt: z.date(),
  metrics: ContainerMetricsSchema.optional(),
});

export type ContainerListItem = z.infer<typeof ContainerListItemSchema>;
