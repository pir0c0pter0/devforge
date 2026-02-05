/**
 * VS Code Health Check Types
 * Shared between backend and frontend
 */

export type VSCodeStatus = 'starting' | 'ready' | 'error' | 'stopped';

export interface VSCodeHealthResponse {
  ready: boolean;
  containerId: string;
  dockerId?: string;
  cached?: boolean;
  lastCheck?: string;
  timestamp?: string;
  reason?: string;
  containerStatus?: string;
  error?: string;
}

export interface VSCodeHealthCheckOptions {
  /** Timeout in milliseconds (default: 30000) */
  timeoutMs?: number;
  /** Poll interval in milliseconds (default: 1000) */
  pollIntervalMs?: number;
  /** Callback for progress updates */
  onProgress?: (elapsed: number, total: number) => void;
}

export interface VSCodeBootstrapEvent {
  stage: VSCodeBootstrapStage;
  containerId: string;
  timestamp: string;
  details?: string;
}

export type VSCodeBootstrapStage =
  | 'container_starting'
  | 'port_binding'
  | 'process_starting'
  | 'health_check_starting'
  | 'extensions_loading'
  | 'workspace_ready'
  | 'fully_ready'
  | 'error';

export interface VSCodeCredentials {
  password: string;
  generatedAt: string;
}
