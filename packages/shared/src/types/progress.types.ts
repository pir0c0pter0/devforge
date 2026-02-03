/**
 * Container creation progress types
 */

export type ContainerProgressStage =
  | 'validating'
  | 'creating'
  | 'starting'
  | 'cloning'
  | 'configuring'
  | 'stopping'
  | 'saving'
  | 'ready'
  | 'error'

export interface ContainerCreationProgress {
  taskId: string
  containerId?: string
  stage: ContainerProgressStage
  percentage: number
  message: string
  error?: string
  timestamp: Date
}

export const PROGRESS_STAGES: Record<ContainerProgressStage, { percentage: number; messageKey: string }> = {
  validating: { percentage: 5, messageKey: 'progress.validating' },
  creating: { percentage: 20, messageKey: 'progress.creating' },
  starting: { percentage: 35, messageKey: 'progress.starting' },
  cloning: { percentage: 55, messageKey: 'progress.cloning' },
  configuring: { percentage: 75, messageKey: 'progress.configuring' },
  stopping: { percentage: 85, messageKey: 'progress.stopping' },
  saving: { percentage: 95, messageKey: 'progress.saving' },
  ready: { percentage: 100, messageKey: 'progress.ready' },
  error: { percentage: 0, messageKey: 'progress.error' },
}
