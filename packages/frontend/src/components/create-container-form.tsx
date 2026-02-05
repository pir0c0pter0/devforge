'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { z } from 'zod'
import { apiClient } from '@/lib/api-client'
import { useI18n } from '@/lib/i18n'
import { useModal } from '@/components/ui/modal'
import type { TemplateType, ContainerMode, RepositoryType } from '@/lib/types'
import { AnimatedDots } from '@/components/ui/animated-dots'
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
  embeddedDev: z.object({
    stm32: z.boolean().optional(),
    esp32: z.boolean().optional(),
  }).optional(),
})

type FormData = z.infer<typeof createContainerSchema>

export function CreateContainerForm() {
  const { t } = useI18n()
  const router = useRouter()
  const modal = useModal()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({})

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
    embeddedDev: {
      stm32: false,
      esp32: false,
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
        embeddedDev: validated.embeddedDev,
      })

      if (response.success && response.data?.taskId) {
        // Redirect immediately to container list - progress will show there
        router.push('/containers')
      } else {
        const errorMessage = response.error || t.createContainer.failedCreate

        // Check if it's a git clone error for better messaging
        if (errorMessage.includes('Git clone failed') || errorMessage.includes('clone repository')) {
          modal.showError(
            'Erro ao clonar repositório',
            'Não foi possível clonar o repositório Git.',
            errorMessage
          )
        } else {
          modal.showError(
            t.createContainer.failedCreate,
            errorMessage
          )
        }
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
        modal.showError(
          t.createContainer.unexpectedError,
          error instanceof Error ? error.message : 'Erro desconhecido'
        )
      }
      setIsSubmitting(false)
    }
  }

  const getButtonText = (): React.ReactNode => {
    if (!isSubmitting) return t.createContainer.create
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

      {/* Embedded Development Options */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-terminal-text">
          <span className="text-terminal-purple">#</span> Embedded Development
        </h3>
        <p className="text-sm text-terminal-textMuted mb-3">
          Pre-install toolchains for microcontroller development (optional)
        </p>

        <div className="space-y-3">
          <label className="flex items-center gap-3 p-3 rounded border border-terminal-border bg-terminal-bg hover:border-terminal-purple/50 cursor-pointer transition-all">
            <input
              type="checkbox"
              checked={formData.embeddedDev?.stm32 || false}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                embeddedDev: { ...prev.embeddedDev, stm32: e.target.checked }
              }))}
              className="w-5 h-5 accent-terminal-purple rounded"
              disabled={isSubmitting}
            />
            <div className="flex-1">
              <div className="font-medium text-terminal-text">STM32 Development</div>
              <div className="text-xs text-terminal-textMuted">
                ARM GCC, OpenOCD, ST-Link tools, Cortex-Debug extension
              </div>
            </div>
            <svg className="w-6 h-6 text-terminal-purple opacity-70" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
            </svg>
          </label>

          <label className="flex items-center gap-3 p-3 rounded border border-terminal-border bg-terminal-bg hover:border-terminal-cyan/50 cursor-pointer transition-all">
            <input
              type="checkbox"
              checked={formData.embeddedDev?.esp32 || false}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                embeddedDev: { ...prev.embeddedDev, esp32: e.target.checked }
              }))}
              className="w-5 h-5 accent-terminal-cyan rounded"
              disabled={isSubmitting}
            />
            <div className="flex-1">
              <div className="font-medium text-terminal-text">ESP32 Development</div>
              <div className="text-xs text-terminal-textMuted">
                PlatformIO IDE with ESP-IDF framework and full toolchain
              </div>
            </div>
            <svg className="w-6 h-6 text-terminal-cyan opacity-70" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.2 5.9l.8-.8C19.6 3.7 17.8 3 16 3s-3.6.7-5 2.1l.8.8C13 4.8 14.5 4.2 16 4.2s3 .6 4.2 1.7zm-.9.8c-.9-.9-2.1-1.4-3.3-1.4s-2.4.5-3.3 1.4l.8.8c.7-.7 1.6-1 2.5-1s1.8.3 2.5 1l.8-.8zM19 13h-2V9h-2v4H5c-1.1 0-2 .9-2 2v4c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-4c0-1.1-.9-2-2-2zM8 18H6v-2h2v2zm3.5 0h-2v-2h2v2zm3.5 0h-2v-2h2v2z"/>
            </svg>
          </label>
        </div>

        {(formData.embeddedDev?.stm32 || formData.embeddedDev?.esp32) && (
          <p className="text-xs text-terminal-yellow flex items-center gap-2">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
            </svg>
            Container creation will take longer due to toolchain installation
          </p>
        )}
      </div>

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
