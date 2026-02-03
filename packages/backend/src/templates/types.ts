/**
 * Container template types for creating pre-configured development environments
 */

/**
 * Container template definition
 */
export interface ContainerTemplate {
  /** Unique template identifier */
  id: string;
  /** Human-readable template name */
  name: string;
  /** Template description */
  description: string;
  /** Icon identifier for UI */
  icon: string;
  /** Language/framework category */
  category: TemplateCategory;
  /** Custom Dockerfile content if template needs special build */
  dockerfile?: string;
  /** Default configuration for containers created from this template */
  defaultConfig: TemplateConfig;
  /** Environment variables required from user */
  requiredEnvVars?: RequiredEnvVar[];
  /** Tags for filtering/searching */
  tags: string[];
}

/**
 * Template category for grouping
 */
export type TemplateCategory =
  | 'language'
  | 'framework'
  | 'fullstack'
  | 'data-science'
  | 'devops'
  | 'custom';

/**
 * Default configuration for template
 */
export interface TemplateConfig {
  /** Docker image to use */
  image: string;
  /** Environment variables to set in container */
  environment: Record<string, string>;
  /** VS Code extensions to install */
  extensions: string[];
  /** Commands to run after container creation */
  postCreateCommands: string[];
  /** Working directory inside container */
  workingDir?: string;
  /** Ports to expose (containerPort: hostPort) */
  ports?: Record<number, number>;
  /** Default resource limits */
  resources?: {
    cpuLimit?: number;
    memoryLimit?: number;
    diskLimit?: number;
  };
}

/**
 * Required environment variable definition
 */
export interface RequiredEnvVar {
  /** Variable name */
  name: string;
  /** Description for UI */
  description: string;
  /** Whether the variable is required */
  required: boolean;
  /** Default value if any */
  defaultValue?: string;
  /** Whether this is a secret value */
  isSecret?: boolean;
}

/**
 * Template list item for API responses
 */
export interface TemplateListItem {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: TemplateCategory;
  tags: string[];
}

/**
 * Request to create container from template
 */
export interface CreateFromTemplateRequest {
  /** Container name */
  name: string;
  /** Template ID to use */
  templateId: string;
  /** Container mode */
  mode: 'interactive' | 'autonomous';
  /** Repository configuration */
  repoType: 'empty' | 'clone';
  repoUrl?: string;
  sshKeyPath?: string;
  /** Environment variable overrides */
  environment?: Record<string, string>;
  /** Resource limit overrides */
  cpuLimit?: number;
  memoryLimit?: number;
  diskLimit?: number;
}
