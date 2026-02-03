'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { z } from 'zod'
import { apiClient } from '@/lib/api-client'
import { useI18n } from '@/lib/i18n'
import type { TemplateType, ContainerMode, RepositoryType, Task } from '@/lib/types'
import { AnimatedDots } from '@/components/ui/animated-dots'
import { useTaskPolling } from '@/hooks/use-task-polling'
import clsx from 'clsx'

/**
 * Normalize GitHub repository URL to a consistent format
 */
const normalizeGithubUrl = (url: string): string => {
  if (!url || url.trim() === '') return ''

  let normalized = url.trim()

  // Remove trailing slashes
  normalized = normalized.replace(/\/+$/, '')

  // Remove .git suffix
  normalized = normalized.replace(/\.git$/, '')

  // Convert SSH format (git@github.com:user/repo) to HTTPS
  const sshMatch = normalized.match(/^git@github\.com:(.+)$/)
  if (sshMatch) {
    return `https://github.com/${sshMatch[1]}`
  }

  // Handle github.com/user/repo without protocol
  if (normalized.match(/^github\.com\//)) {
    return `https://${normalized}`
  }

  // Handle http:// (convert to https://)
  if (normalized.startsWith('http://github.com/')) {
    return normalized.replace('http://', 'https://')
  }

  // Handle www.github.com
  if (normalized.includes('www.github.com')) {
    normalized = normalized.replace('www.github.com', 'github.com')
    if (!normalized.startsWith('https://')) {
      normalized = `https://${normalized.replace(/^https?:\/\//, '')}`
    }
    return normalized
  }

  // If already https://github.com, return as-is
  if (normalized.startsWith('https://github.com/')) {
    return normalized
  }

  // If it looks like user/repo format, assume GitHub
  if (normalized.match(/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/)) {
    return `https://github.com/${normalized}`
  }

  return normalized
}

const createContainerSchema = z.object({
  name: z
    .string()
    .min(1, 'nameRequired')
    .max(50, 'nameMaxLength')
    .regex(/^[a-zA-Z0-9-_]+$/, 'nameInvalid'),
  template: z.enum(['claude', 'vscode', 'both']),
  mode: z.enum(['interactive', 'autonomous']),
  repositoryType: z.enum(['empty', 'github']),
  repositoryUrl: z.string().optional(),
  limits: z.object({
    cpuCores: z.number().min(1).max(16),
    memoryMB: z.number().min(512).max(32768),
    diskGB: z.number().min(1).max(100),
  }),
})

type FormData = z.infer<typeof createContainerSchema>

export function CreateContainerForm() {
  const { t } = useI18n()
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({})
  const [generalError, setGeneralError] = useState<string | null>(null)
  const [taskId, setTaskId] = useState<string | null>(null)

  const { task } = useTaskPolling(taskId, {
    onComplete: (completedTask: Task) => {
      if (completedTask.result?.containerId) {
        router.push('/containers')
      }
    },
    onError: (failedTask: Task) => {
      setGeneralError(failedTask.error || t.createContainer.failedCreate)
      setIsSubmitting(false)
    },
  })

  const [formData, setFormData] = useState<FormData>({
    name: '',
    template: 'both',
    mode: 'interactive',
    repositoryType: 'empty',
    repositoryUrl: '',
    limits: {
      cpuCores: 2,
      memoryMB: 2048,
      diskGB: 10,
    },
  })

  const errorMessages: Record<string, string> = {
    nameRequired: t.createContainer.nameRequired,
    nameMaxLength: t.createContainer.nameMaxLength,
    nameInvalid: t.createContainer.nameInvalid,
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrors({})
    setGeneralError(null)

    try {
      const validated = createContainerSchema.parse(formData)

      // Normalize GitHub URL before validation
      const normalizedUrl = validated.repositoryUrl
        ? normalizeGithubUrl(validated.repositoryUrl)
        : ''

      if (validated.repositoryType === 'github' && !normalizedUrl) {
        setErrors({ repositoryUrl: t.createContainer.repositoryUrlRequired })
        return
      }

      // Update form with normalized URL so user sees the corrected value
      if (normalizedUrl && normalizedUrl !== validated.repositoryUrl) {
        updateFormData('repositoryUrl', normalizedUrl)
      }

      setIsSubmitting(true)

      const response = await apiClient.createContainer({
        name: validated.name,
        template: validated.template,
        mode: validated.mode,
        repositoryType: validated.repositoryType,
        repositoryUrl: normalizedUrl,
        limits: validated.limits,
      })

      if (response.success && response.data?.taskId) {
        // Start polling the task
        setTaskId(response.data.taskId)
      } else {
        setGeneralError(response.error || t.createContainer.failedCreate)
        setIsSubmitting(false)
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: Partial<Record<keyof FormData, string>> = {}
        error.errors.forEach((err) => {
          const path = err.path[0] as keyof FormData
          const msgKey = err.message
          fieldErrors[path] = errorMessages[msgKey] || err.message
        })
        setErrors(fieldErrors)
      } else {
        setGeneralError(t.createContainer.unexpectedError)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const getButtonText = (): React.ReactNode => {
    if (!isSubmitting) return t.createContainer.create

    if (task) {
      return <AnimatedDots text={`${task.message} (${task.progress}%)`} />
    }

    return <AnimatedDots text={t.createContainer.progressCreating} />
  }

  const updateFormData = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setFormData((prev) => ({
      ...prev,
      [key]: value,
    }))
  }

  const updateLimits = <K extends keyof FormData['limits']>(
    key: K,
    value: FormData['limits'][K]
  ) => {
    setFormData((prev) => ({
      ...prev,
      limits: {
        ...prev.limits,
        [key]: value,
      },
    }))
  }

  const handleRepositoryUrlBlur = () => {
    if (formData.repositoryUrl) {
      const normalized = normalizeGithubUrl(formData.repositoryUrl)
      if (normalized !== formData.repositoryUrl) {
        updateFormData('repositoryUrl', normalized)
      }
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {generalError && (
        <div className="bg-danger-900/20 border border-danger-600/50 rounded p-4">
          <p className="text-sm text-terminal-red">{generalError}</p>
        </div>
      )}

      <div>
        <label htmlFor="name" className="label">
          <span className="text-terminal-green">$</span> {t.createContainer.name} *
        </label>
        <input
          type="text"
          id="name"
          value={formData.name}
          onChange={(e) => updateFormData('name', e.target.value)}
          className={clsx('input', errors.name && 'border-terminal-red')}
          placeholder={t.createContainer.namePlaceholder}
          disabled={isSubmitting}
        />
        {errors.name && (
          <p className="mt-1 text-sm text-terminal-red">{errors.name}</p>
        )}
      </div>

      <div>
        <label className="label">
          <span className="text-terminal-green">$</span> {t.createContainer.template} *
        </label>
        <div className="grid grid-cols-3 gap-3">
          {(['claude', 'vscode', 'both'] as TemplateType[]).map((template) => (
            <button
              key={template}
              type="button"
              onClick={() => updateFormData('template', template)}
              className={clsx(
                'p-3 rounded border transition-all text-center',
                formData.template === template
                  ? 'border-terminal-green bg-terminal-green/10 text-terminal-green'
                  : 'border-terminal-border bg-terminal-bg text-terminal-textMuted hover:border-terminal-green/50'
              )}
              disabled={isSubmitting}
            >
              <div className="font-medium">
                {template === 'both' ? t.createContainer.templateClaudeVscode : t.templates[template]}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="label">
          <span className="text-terminal-green">$</span> {t.createContainer.mode} *
        </label>
        <div className="grid grid-cols-2 gap-3">
          {(['interactive', 'autonomous'] as ContainerMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => updateFormData('mode', mode)}
              className={clsx(
                'p-3 rounded border transition-all text-center',
                formData.mode === mode
                  ? 'border-terminal-cyan bg-terminal-cyan/10 text-terminal-cyan'
                  : 'border-terminal-border bg-terminal-bg text-terminal-textMuted hover:border-terminal-cyan/50'
              )}
              disabled={isSubmitting}
            >
              <div className="font-medium">
                {t.modes[mode]}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="label">
          <span className="text-terminal-green">$</span> {t.createContainer.repositoryType} *
        </label>
        <div className="grid grid-cols-2 gap-3">
          {(['empty', 'github'] as RepositoryType[]).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => updateFormData('repositoryType', type)}
              className={clsx(
                'p-3 rounded border transition-all text-center',
                formData.repositoryType === type
                  ? 'border-terminal-yellow bg-terminal-yellow/10 text-terminal-yellow'
                  : 'border-terminal-border bg-terminal-bg text-terminal-textMuted hover:border-terminal-yellow/50'
              )}
              disabled={isSubmitting}
            >
              <div className="font-medium">
                {type === 'empty' ? t.createContainer.emptyFolder : t.createContainer.githubClone}
              </div>
            </button>
          ))}
        </div>
      </div>

      {formData.repositoryType === 'github' && (
        <div>
          <label htmlFor="repositoryUrl" className="label">
            <span className="text-terminal-green">$</span> {t.createContainer.repositoryUrl} *
          </label>
          <input
            type="text"
            id="repositoryUrl"
            value={formData.repositoryUrl}
            onChange={(e) => updateFormData('repositoryUrl', e.target.value)}
            onBlur={handleRepositoryUrlBlur}
            className={clsx('input', errors.repositoryUrl && 'border-terminal-red')}
            placeholder="github.com/user/repo ou https://github.com/user/repo"
            disabled={isSubmitting}
          />
          {errors.repositoryUrl && (
            <p className="mt-1 text-sm text-terminal-red">
              {errors.repositoryUrl}
            </p>
          )}
        </div>
      )}

      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-terminal-text">
          <span className="text-terminal-green">#</span> {t.createContainer.resourceLimits}
        </h3>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="cpuCores" className="label mb-0">
              {t.createContainer.cpuCores}
            </label>
            <span className="text-sm font-medium text-terminal-green">
              {formData.limits.cpuCores}
            </span>
          </div>
          <input
            type="range"
            id="cpuCores"
            min="1"
            max="16"
            step="1"
            value={formData.limits.cpuCores}
            onChange={(e) => updateLimits('cpuCores', parseInt(e.target.value))}
            className="w-full accent-terminal-green"
            disabled={isSubmitting}
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="memoryMB" className="label mb-0">
              {t.createContainer.memoryMb}
            </label>
            <span className="text-sm font-medium text-terminal-green">
              {formData.limits.memoryMB}
            </span>
          </div>
          <input
            type="range"
            id="memoryMB"
            min="512"
            max="32768"
            step="512"
            value={formData.limits.memoryMB}
            onChange={(e) => updateLimits('memoryMB', parseInt(e.target.value))}
            className="w-full accent-terminal-green"
            disabled={isSubmitting}
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="diskGB" className="label mb-0">
              {t.createContainer.diskGb}
            </label>
            <span className="text-sm font-medium text-terminal-green">
              {formData.limits.diskGB}
            </span>
          </div>
          <input
            type="range"
            id="diskGB"
            min="1"
            max="100"
            step="1"
            value={formData.limits.diskGB}
            onChange={(e) => updateLimits('diskGB', parseInt(e.target.value))}
            className="w-full accent-terminal-green"
            disabled={isSubmitting}
          />
        </div>
      </div>

      {isSubmitting && task && (
        <div className="pt-2">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-terminal-textMuted">{task.message}</span>
              <span className="text-terminal-green font-mono">{task.progress}%</span>
            </div>
            <div className="w-full bg-terminal-bg border border-terminal-border rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-terminal-green transition-all duration-300 ease-out"
                style={{ width: `${task.progress}%` }}
              />
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-4 pt-4">
        <button
          type="submit"
          className="btn-primary flex-1"
          disabled={isSubmitting}
        >
          {getButtonText()}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="btn-secondary"
          disabled={isSubmitting}
        >
          {t.createContainer.cancel}
        </button>
      </div>
    </form>
  )
}
