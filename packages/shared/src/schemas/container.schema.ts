import { z } from 'zod'

/**
 * Zod schema for validating container configuration
 */
export const containerConfigSchema = z.object({
  name: z
    .string()
    .min(1, 'Container name is required')
    .max(50, 'Container name must be 50 characters or less')
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      'Container name must contain only alphanumeric characters, hyphens, and underscores'
    ),
  template: z.enum(['claude', 'vscode', 'both'], {
    errorMap: () => ({ message: 'Template must be claude, vscode, or both' }),
  }),
  mode: z.enum(['interactive', 'autonomous'], {
    errorMap: () => ({ message: 'Mode must be interactive or autonomous' }),
  }),
  repoUrl: z
    .string()
    .url('Repository URL must be a valid URL')
    .optional()
    .or(z.literal('')),
  repoType: z.enum(['empty', 'clone'], {
    errorMap: () => ({ message: 'Repository type must be empty or clone' }),
  }),
  sshKeyPath: z.string().optional().or(z.literal('')),
  cpuLimit: z
    .string()
    .regex(/^\d+(\.\d+)?$/, 'CPU limit must be a number (e.g., 2.0)')
    .default('2.0'),
  memoryLimit: z
    .string()
    .regex(/^\d+(M|G)$/, 'Memory limit must be a number with M or G suffix (e.g., 4G)')
    .default('4G'),
  diskLimit: z
    .string()
    .regex(/^\d+(M|G)$/, 'Disk limit must be a number with M or G suffix (e.g., 20G)')
    .default('20G'),
})
  .refine(
    (data) => {
      if (data.repoType === 'clone') {
        return data.repoUrl && data.repoUrl.length > 0
      }
      return true
    },
    {
      message: 'Repository URL is required when repository type is clone',
      path: ['repoUrl'],
    }
  )

/**
 * TypeScript type inferred from the schema
 */
export type ContainerConfigInput = z.infer<typeof containerConfigSchema>
