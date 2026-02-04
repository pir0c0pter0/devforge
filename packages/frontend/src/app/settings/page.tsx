'use client'

import { useState, useEffect, useCallback } from 'react'
import { useI18n } from '@/lib/i18n'
import { useModal } from '@/components/ui/modal'
import { AnimatedDots } from '@/components/ui/animated-dots'

interface ClaudeStatus {
  authenticated: boolean
  credentialsPath: string
  credentialsExists: boolean
  settingsExists: boolean
  skillsCount: number
  agentsCount: number
  rulesCount: number
  lastAuthDate?: string
}

interface SystemStatus {
  dockerRunning: boolean
  dockerGroup: boolean
  redisRunning: boolean
  sshKeysExist: boolean
  sshKeyType?: string
  sshPublicKey?: string
  githubAuthenticated?: boolean
  githubUsername?: string
}

interface Config {
  port: number
  frontendPort: number
  nodeEnv: string
  redisUrl: string
  defaultCpuLimit: number
  defaultMemoryLimit: number
  defaultDiskLimit: number
}

interface DiagnosticCheck {
  name: string
  status: 'ok' | 'warning' | 'error'
  message: string
  details?: string[]
  fixInstructions?: string[]
}

interface DiagnosticsResult {
  timestamp: string
  system: {
    user: string
    platform: string
    release: string
  }
  checks: DiagnosticCheck[]
  summary: {
    total: number
    ok: number
    warnings: number
    errors: number
  }
}

interface TelegramStatus {
  isRunning: boolean
  mode: 'polling' | 'webhook' | null
  allowedUsers: number
  rateLimits?: {
    read: number
    write: number
    critical: number
  }
}

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:8000'

export default function SettingsPage() {
  const { t, language, setLanguage } = useI18n()
  const modal = useModal()
  const [claudeStatus, setClaudeStatus] = useState<ClaudeStatus | null>(null)
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null)
  const [config, setConfig] = useState<Config | null>(null)
  const [loading, setLoading] = useState(true)
  const [authInstructions, setAuthInstructions] = useState<string[] | null>(null)
  const [sshGenerating, setSshGenerating] = useState(false)
  const [sshEmail, setSshEmail] = useState('')
  const [showSshForm, setShowSshForm] = useState(false)
  const [diagnosticsResult, setDiagnosticsResult] = useState<DiagnosticsResult | null>(null)
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false)
  const [showDiagnosticsModal, setShowDiagnosticsModal] = useState(false)
  const [telegramStatus, setTelegramStatus] = useState<TelegramStatus | null>(null)
  const [telegramConfig, setTelegramConfig] = useState<{
    hasToken: boolean
    tokenMasked: string
    allowedUsers: string
  } | null>(null)
  const [telegramToken, setTelegramToken] = useState('')
  const [telegramAllowedUsers, setTelegramAllowedUsers] = useState('')
  const [telegramSaving, setTelegramSaving] = useState(false)
  const [showTelegramForm, setShowTelegramForm] = useState(false)

  const fetchStatus = useCallback(async () => {
    try {
      const [claudeRes, systemRes, configRes, telegramRes] = await Promise.all([
        fetch(`${API_URL}/api/settings/claude-status`),
        fetch(`${API_URL}/api/settings/system-status`),
        fetch(`${API_URL}/api/settings/config`),
        fetch(`${API_URL}/api/telegram/status`),
      ])

      if (claudeRes.ok) {
        setClaudeStatus(await claudeRes.json())
      }
      if (systemRes.ok) {
        setSystemStatus(await systemRes.json())
      }
      if (configRes.ok) {
        setConfig(await configRes.json())
      }
      if (telegramRes.ok) {
        const telegramData = await telegramRes.json()
        setTelegramStatus(telegramData.data || telegramData)
      }

      // Fetch telegram config separately
      try {
        const telegramConfigRes = await fetch(`${API_URL}/api/settings/telegram-config`)
        if (telegramConfigRes.ok) {
          const configData = await telegramConfigRes.json()
          setTelegramConfig(configData.data)
          if (configData.data?.allowedUsers) {
            setTelegramAllowedUsers(configData.data.allowedUsers)
          }
        }
      } catch {
        // Ignore telegram config errors
      }
    } catch (error) {
      console.error('Failed to fetch status:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  const handleOpenAuth = async () => {
    try {
      const res = await fetch(`${API_URL}/api/settings/open-claude-auth`, {
        method: 'POST',
      })
      const data = await res.json()
      if (data.instructions) {
        setAuthInstructions(data.instructions)
      }
    } catch (error) {
      console.error('Failed to open auth:', error)
    }
  }

  const handleLogout = async () => {
    const confirmed = await modal.confirm({
      title: 'Logout do Claude Code',
      message: t.settings.claudeAuth.confirmLogout,
      type: 'warning',
      confirmLabel: t.settings.claudeAuth.logout,
      cancelLabel: 'Cancelar',
    })

    if (!confirmed) {
      return
    }

    try {
      const res = await fetch(`${API_URL}/api/settings/logout-claude`, {
        method: 'POST',
      })
      if (res.ok) {
        await fetchStatus()
        modal.showSuccess('Logout realizado', 'Você foi deslogado do Claude Code.')
      }
    } catch (error) {
      console.error('Failed to logout:', error)
      modal.showError('Erro ao fazer logout', 'Não foi possível fazer logout do Claude Code.')
    }
  }

  const handleGenerateSshKey = async () => {
    if (!sshEmail || !sshEmail.includes('@')) {
      modal.showWarning('Email inválido', t.settings.github.emailInvalid)
      return
    }

    setSshGenerating(true)
    try {
      const res = await fetch(`${API_URL}/api/settings/generate-ssh-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: sshEmail }),
      })
      if (res.ok) {
        await fetchStatus()
        setShowSshForm(false)
        setSshEmail('')
      } else {
        const data = await res.json()
        alert(data.error || t.settings.github.generateError)
      }
    } catch (error) {
      console.error('Failed to generate SSH key:', error)
      alert(t.settings.github.generateError)
    } finally {
      setSshGenerating(false)
    }
  }

  const handleCopySshKey = () => {
    if (systemStatus?.sshPublicKey) {
      navigator.clipboard.writeText(systemStatus.sshPublicKey)
      alert(t.settings.github.copied)
    }
  }

  const handleRunDiagnostics = async () => {
    setDiagnosticsLoading(true)
    setShowDiagnosticsModal(true)
    try {
      const res = await fetch(`${API_URL}/api/diagnostics`)
      if (res.ok) {
        const data = await res.json()
        setDiagnosticsResult(data.data)
      }
    } catch (error) {
      console.error('Failed to run diagnostics:', error)
    } finally {
      setDiagnosticsLoading(false)
    }
  }

  const handleSaveTelegramConfig = async () => {
    setTelegramSaving(true)
    try {
      const payload: { token?: string; allowedUsers?: string } = {}

      // Only send token if user entered a new one
      if (telegramToken) {
        payload.token = telegramToken
      }

      // Always send allowed users
      payload.allowedUsers = telegramAllowedUsers

      const res = await fetch(`${API_URL}/api/settings/telegram-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (res.ok && data.success) {
        modal.showSuccess(t.settings.telegram.configSaved, t.settings.telegram.restartRequired)
        setTelegramToken('')
        setShowTelegramForm(false)
        await fetchStatus()
      } else {
        modal.showError(t.settings.telegram.configSaveFailed, data.error || 'Unknown error')
      }
    } catch (error) {
      console.error('Failed to save Telegram config:', error)
      modal.showError(t.settings.telegram.configSaveFailed, 'Network error')
    } finally {
      setTelegramSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-terminal-green border-t-transparent"></div>
          <p className="mt-4 text-terminal-textMuted">
            <AnimatedDots text={t.settings.loading} />
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-terminal-green terminal-glow mb-2">
          <span className="text-terminal-textMuted">$</span> {t.settings.title}
        </h2>
        <p className="text-terminal-textMuted">
          {t.settings.subtitle}
        </p>
      </div>

      {/* Language Selection */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-terminal-cyan/10 border border-terminal-cyan/30 rounded-lg flex items-center justify-center">
              <span className="text-terminal-cyan text-lg">@</span>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-terminal-text">
                {t.settings.language.title}
              </h3>
              <p className="text-sm text-terminal-textMuted">
                {t.settings.language.subtitle}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setLanguage('pt-BR')}
            className={`p-4 rounded border transition-all text-left ${
              language === 'pt-BR'
                ? 'border-terminal-green bg-terminal-green/10 text-terminal-green'
                : 'border-terminal-border bg-terminal-bg text-terminal-textMuted hover:border-terminal-green/50'
            }`}
          >
            <div className="font-medium">{t.settings.language.portuguese}</div>
            <div className="text-xs mt-1 opacity-70">Portugues do Brasil</div>
          </button>
          <button
            onClick={() => setLanguage('en')}
            className={`p-4 rounded border transition-all text-left ${
              language === 'en'
                ? 'border-terminal-green bg-terminal-green/10 text-terminal-green'
                : 'border-terminal-border bg-terminal-bg text-terminal-textMuted hover:border-terminal-green/50'
            }`}
          >
            <div className="font-medium">{t.settings.language.english}</div>
            <div className="text-xs mt-1 opacity-70">English</div>
          </button>
        </div>
      </div>

      {/* Claude Code Authentication */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
              claudeStatus?.authenticated
                ? 'bg-terminal-green/10 border border-terminal-green/30'
                : 'bg-terminal-yellow/10 border border-terminal-yellow/30'
            }`}>
              <span className={`text-lg ${
                claudeStatus?.authenticated ? 'text-terminal-green' : 'text-terminal-yellow'
              }`}>
                {claudeStatus?.authenticated ? '*' : '!'}
              </span>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-terminal-text">
                {t.settings.claudeAuth.title}
              </h3>
              <p className="text-sm text-terminal-textMuted">
                {t.settings.claudeAuth.subtitle}
              </p>
            </div>
          </div>
          <span className={`badge ${
            claudeStatus?.authenticated ? 'badge-success' : 'badge-warning'
          }`}>
            {claudeStatus?.authenticated ? t.settings.claudeAuth.authenticated : t.settings.claudeAuth.notAuthenticated}
          </span>
        </div>

        {claudeStatus?.authenticated ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="stats-card">
                <p className="stats-label">{t.settings.claudeAuth.skills}</p>
                <p className="stats-value">{claudeStatus.skillsCount}</p>
              </div>
              <div className="stats-card">
                <p className="stats-label">{t.settings.claudeAuth.agents}</p>
                <p className="stats-value">{claudeStatus.agentsCount}</p>
              </div>
              <div className="stats-card">
                <p className="stats-label">{t.settings.claudeAuth.rules}</p>
                <p className="stats-value">{claudeStatus.rulesCount}</p>
              </div>
              <div className="stats-card">
                <p className="stats-label">{t.settings.claudeAuth.lastAuth}</p>
                <p className="text-sm font-medium text-terminal-text">
                  {claudeStatus.lastAuthDate
                    ? new Date(claudeStatus.lastAuthDate).toLocaleDateString(language === 'pt-BR' ? 'pt-BR' : 'en-US')
                    : '-'}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-terminal-border">
              <p className="text-sm text-terminal-textMuted">
                {t.settings.claudeAuth.credentialsShared}
              </p>
              <button
                onClick={handleLogout}
                className="px-4 py-2 text-sm font-medium text-terminal-red hover:text-terminal-red/80"
              >
                {t.settings.claudeAuth.logout}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-terminal-yellow/10 border border-terminal-yellow/30 rounded p-4">
              <p className="text-sm text-terminal-yellow">
                {t.settings.claudeAuth.authRequired}
              </p>
            </div>

            {authInstructions ? (
              <div className="bg-terminal-bg rounded p-4">
                <p className="font-medium text-terminal-text mb-3">
                  {t.settings.claudeAuth.authInstructions}
                </p>
                <ol className="space-y-2">
                  {authInstructions.map((instruction, i) => (
                    <li key={i} className="flex items-start space-x-2 text-sm text-terminal-textMuted">
                      <span className="flex-shrink-0 w-5 h-5 bg-terminal-green/10 rounded flex items-center justify-center text-xs font-medium text-terminal-green">
                        {i + 1}
                      </span>
                      <span>{instruction.replace(/^\d+\.\s*/, '')}</span>
                    </li>
                  ))}
                </ol>
                <div className="mt-4 p-3 bg-terminal-bgLight rounded border border-terminal-border">
                  <code className="text-sm text-terminal-green">$ claude</code>
                </div>
                <button
                  onClick={fetchStatus}
                  className="mt-4 btn-secondary w-full"
                >
                  {t.settings.claudeAuth.verifyAuth}
                </button>
              </div>
            ) : (
              <button
                onClick={handleOpenAuth}
                className="btn-primary w-full"
              >
                {t.settings.claudeAuth.configureAuth}
              </button>
            )}
          </div>
        )}
      </div>

      {/* GitHub / SSH Configuration */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
              systemStatus?.sshKeysExist
                ? 'bg-terminal-green/10 border border-terminal-green/30'
                : 'bg-terminal-border'
            }`}>
              <svg className="w-6 h-6 text-terminal-text" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-terminal-text">
                {t.settings.github.title}
              </h3>
              <p className="text-sm text-terminal-textMuted">
                {t.settings.github.subtitle}
              </p>
            </div>
          </div>
          <span className={`badge ${
            systemStatus?.sshKeysExist ? 'badge-success' : 'badge-gray'
          }`}>
            {systemStatus?.sshKeysExist ? t.settings.github.configured : t.settings.github.notConfigured}
          </span>
        </div>

        {systemStatus?.sshKeysExist ? (
          <div className="space-y-4">
            <div className="bg-terminal-green/10 border border-terminal-green/30 rounded p-4">
              <p className="text-sm text-terminal-green">
                {t.settings.github.sshConfigured.replace('configurada', `${systemStatus.sshKeyType} configurada`)}
              </p>
            </div>

            {systemStatus.sshPublicKey && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-terminal-text">
                  {t.settings.github.publicKey}
                </label>
                <div className="relative">
                  <textarea
                    readOnly
                    value={systemStatus.sshPublicKey}
                    className="w-full h-24 p-3 text-xs font-mono bg-terminal-bg text-terminal-green rounded border border-terminal-border resize-none"
                  />
                  <button
                    onClick={handleCopySshKey}
                    className="absolute top-2 right-2 px-3 py-1 text-xs bg-terminal-border hover:bg-terminal-textMuted/30 text-terminal-text rounded"
                  >
                    {t.settings.github.copy}
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-center space-x-4 pt-4 border-t border-terminal-border">
              <a
                href="https://github.com/settings/ssh/new"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
                <span>{t.settings.github.addToGithub}</span>
              </a>
              <button onClick={fetchStatus} className="btn-secondary">
                {t.settings.github.verify}
              </button>
            </div>

            {systemStatus.githubAuthenticated && (
              <div className="flex items-center space-x-2 text-sm text-terminal-green">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>{t.settings.github.connectedAs} {systemStatus.githubUsername}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-terminal-bg border border-terminal-border rounded p-4">
              <p className="text-sm text-terminal-textMuted mb-3">
                {t.settings.github.sshInstructions}
              </p>
              <ol className="space-y-2 text-sm text-terminal-textMuted">
                <li className="flex items-start space-x-2">
                  <span className="flex-shrink-0 w-5 h-5 bg-terminal-green/10 rounded flex items-center justify-center text-xs font-medium text-terminal-green">1</span>
                  <span>{t.settings.github.step1}</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="flex-shrink-0 w-5 h-5 bg-terminal-green/10 rounded flex items-center justify-center text-xs font-medium text-terminal-green">2</span>
                  <span>{t.settings.github.step2}</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="flex-shrink-0 w-5 h-5 bg-terminal-green/10 rounded flex items-center justify-center text-xs font-medium text-terminal-green">3</span>
                  <span>{t.settings.github.step3}</span>
                </li>
              </ol>
            </div>

            {showSshForm ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-terminal-text mb-2">
                    {t.settings.github.email}
                  </label>
                  <input
                    type="email"
                    value={sshEmail}
                    onChange={(e) => setSshEmail(e.target.value)}
                    placeholder={t.settings.github.emailPlaceholder}
                    className="input"
                  />
                </div>
                <div className="flex items-center space-x-3">
                  <button
                    onClick={handleGenerateSshKey}
                    disabled={sshGenerating}
                    className="btn-primary disabled:opacity-50"
                  >
                    {sshGenerating ? <AnimatedDots text={t.settings.github.generatingText} /> : t.settings.github.generateSsh}
                  </button>
                  <button
                    onClick={() => setShowSshForm(false)}
                    className="btn-secondary"
                  >
                    {t.common.cancel}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowSshForm(true)}
                className="btn-primary w-full"
              >
                {t.settings.github.configureSsh}
              </button>
            )}

          </div>
        )}
      </div>

      {/* Telegram Bot Configuration */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
              telegramStatus?.isRunning
                ? 'bg-terminal-green/10 border border-terminal-green/30'
                : 'bg-terminal-border'
            }`}>
              <svg className="w-6 h-6 text-terminal-cyan" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/>
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-terminal-text">
                {t.settings.telegram.title}
              </h3>
              <p className="text-sm text-terminal-textMuted">
                {t.settings.telegram.subtitle}
              </p>
            </div>
          </div>
          <span className={`badge ${
            telegramStatus?.isRunning ? 'badge-success' : 'badge-gray'
          }`}>
            {telegramStatus?.isRunning ? t.settings.telegram.running : t.settings.telegram.notConfigured}
          </span>
        </div>

        {telegramStatus?.isRunning ? (
          <div className="space-y-4">
            {/* Bot Status */}
            <div className="bg-terminal-green/10 border border-terminal-green/30 rounded p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 rounded-full bg-terminal-green animate-pulse"></div>
                  <span className="text-sm text-terminal-green font-medium">
                    Bot {t.settings.telegram.running}
                  </span>
                </div>
                <span className="text-xs text-terminal-textMuted">
                  {t.settings.telegram.mode}: {telegramStatus.mode === 'webhook' ? t.settings.telegram.modeWebhook : t.settings.telegram.modePolling}
                </span>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="stats-card">
                <p className="stats-label">{t.settings.telegram.allowedUsers}</p>
                <p className="stats-value">{telegramStatus.allowedUsers}</p>
              </div>
              {telegramStatus.rateLimits && (
                <>
                  <div className="stats-card">
                    <p className="stats-label">{t.settings.telegram.rateLimitRead}</p>
                    <p className="stats-value">{telegramStatus.rateLimits.read}{t.settings.telegram.perMinute}</p>
                  </div>
                  <div className="stats-card">
                    <p className="stats-label">{t.settings.telegram.rateLimitWrite}</p>
                    <p className="stats-value">{telegramStatus.rateLimits.write}{t.settings.telegram.perMinute}</p>
                  </div>
                  <div className="stats-card">
                    <p className="stats-label">{t.settings.telegram.rateLimitCritical}</p>
                    <p className="stats-value">{telegramStatus.rateLimits.critical}{t.settings.telegram.perMinute}</p>
                  </div>
                </>
              )}
            </div>

            {/* Available Commands */}
            <div className="bg-terminal-bg rounded p-4">
              <p className="font-medium text-terminal-text mb-3">{t.settings.telegram.commands}</p>
              <div className="grid grid-cols-2 gap-2 text-sm font-mono">
                <div className="text-terminal-cyan">{t.settings.telegram.commandHelp}</div>
                <div className="text-terminal-cyan">{t.settings.telegram.commandList}</div>
                <div className="text-terminal-cyan">{t.settings.telegram.commandSelect}</div>
                <div className="text-terminal-cyan">{t.settings.telegram.commandStats}</div>
                <div className="text-terminal-cyan">{t.settings.telegram.commandQueue}</div>
                <div className="text-terminal-cyan">{t.settings.telegram.commandExec}</div>
              </div>
            </div>

            {/* Edit Configuration */}
            <div className="pt-4 border-t border-terminal-border">
              {showTelegramForm ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-terminal-text mb-2">
                      {t.settings.telegram.botToken}
                    </label>
                    <input
                      type="password"
                      value={telegramToken}
                      onChange={(e) => setTelegramToken(e.target.value)}
                      placeholder={telegramConfig?.hasToken ? t.settings.telegram.keepCurrentToken : t.settings.telegram.botTokenPlaceholder}
                      className="input"
                    />
                    <p className="text-xs text-terminal-textMuted mt-1">
                      {telegramConfig?.hasToken && `${t.settings.telegram.currentToken}: ${telegramConfig.tokenMasked}`}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-terminal-text mb-2">
                      {t.settings.telegram.allowedUsersLabel}
                    </label>
                    <input
                      type="text"
                      value={telegramAllowedUsers}
                      onChange={(e) => setTelegramAllowedUsers(e.target.value)}
                      placeholder={t.settings.telegram.allowedUsersPlaceholder}
                      className="input"
                    />
                    <p className="text-xs text-terminal-textMuted mt-1">{t.settings.telegram.allowedUsersHelp}</p>
                  </div>
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={handleSaveTelegramConfig}
                      disabled={telegramSaving}
                      className="btn-primary disabled:opacity-50"
                    >
                      {telegramSaving ? <AnimatedDots text={t.settings.telegram.saving} /> : t.settings.telegram.saveConfig}
                    </button>
                    <button
                      onClick={() => { setShowTelegramForm(false); setTelegramToken(''); }}
                      className="btn-secondary"
                    >
                      {t.common.cancel}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowTelegramForm(true)}
                  className="btn-secondary"
                >
                  {t.settings.telegram.changeToken}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Not configured - show form */}
            <div className="bg-terminal-yellow/10 border border-terminal-yellow/30 rounded p-4">
              <p className="text-sm text-terminal-yellow">
                {t.settings.telegram.tokenRequired}
              </p>
            </div>

            {/* Setup Instructions */}
            <div className="bg-terminal-bg rounded p-4">
              <p className="font-medium text-terminal-text mb-3">
                {t.settings.telegram.configInstructions}
              </p>
              <ol className="space-y-2">
                <li className="flex items-start space-x-2 text-sm text-terminal-textMuted">
                  <span className="flex-shrink-0 w-5 h-5 bg-terminal-cyan/10 rounded flex items-center justify-center text-xs font-medium text-terminal-cyan">1</span>
                  <span>{t.settings.telegram.step1}</span>
                </li>
                <li className="flex items-start space-x-2 text-sm text-terminal-textMuted">
                  <span className="flex-shrink-0 w-5 h-5 bg-terminal-cyan/10 rounded flex items-center justify-center text-xs font-medium text-terminal-cyan">2</span>
                  <span>{t.settings.telegram.step2}</span>
                </li>
                <li className="flex items-start space-x-2 text-sm text-terminal-textMuted">
                  <span className="flex-shrink-0 w-5 h-5 bg-terminal-cyan/10 rounded flex items-center justify-center text-xs font-medium text-terminal-cyan">3</span>
                  <span>{t.settings.telegram.step3}</span>
                </li>
                <li className="flex items-start space-x-2 text-sm text-terminal-textMuted">
                  <span className="flex-shrink-0 w-5 h-5 bg-terminal-cyan/10 rounded flex items-center justify-center text-xs font-medium text-terminal-cyan">4</span>
                  <span>{t.settings.telegram.step4}</span>
                </li>
              </ol>
            </div>

            {/* Configuration Form */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-terminal-text mb-2">
                  {t.settings.telegram.botToken}
                </label>
                <input
                  type="password"
                  value={telegramToken}
                  onChange={(e) => setTelegramToken(e.target.value)}
                  placeholder={t.settings.telegram.botTokenPlaceholder}
                  className="input"
                />
                <p className="text-xs text-terminal-textMuted mt-1">{t.settings.telegram.botTokenHelp}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-terminal-text mb-2">
                  {t.settings.telegram.allowedUsersLabel}
                </label>
                <input
                  type="text"
                  value={telegramAllowedUsers}
                  onChange={(e) => setTelegramAllowedUsers(e.target.value)}
                  placeholder={t.settings.telegram.allowedUsersPlaceholder}
                  className="input"
                />
                <p className="text-xs text-terminal-textMuted mt-1">{t.settings.telegram.allowedUsersHelp}</p>
              </div>
              <button
                onClick={handleSaveTelegramConfig}
                disabled={telegramSaving || !telegramToken}
                className="btn-primary w-full disabled:opacity-50"
              >
                {telegramSaving ? <AnimatedDots text={t.settings.telegram.saving} /> : t.settings.telegram.saveConfig}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* System Status */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-terminal-text mb-4">
          <span className="text-terminal-green">#</span> {t.settings.system.title}
        </h3>
        <div className="space-y-3">
          <StatusItem
            label={t.settings.system.docker}
            status={systemStatus?.dockerRunning ?? false}
            description={systemStatus?.dockerRunning ? t.settings.system.dockerRunning : t.settings.system.dockerStopped}
          />
          <StatusItem
            label={t.settings.system.dockerGroup}
            status={systemStatus?.dockerGroup ?? false}
            description={systemStatus?.dockerGroup ? t.settings.system.dockerGroupOk : t.settings.system.dockerGroupError}
          />
          <StatusItem
            label={t.settings.system.redis}
            status={systemStatus?.redisRunning ?? false}
            description={systemStatus?.redisRunning ? t.settings.system.redisRunning : t.settings.system.redisStopped}
            optional
          />
          <StatusItem
            label={t.settings.system.sshKeys}
            status={systemStatus?.sshKeysExist ?? false}
            description={
              systemStatus?.sshKeysExist
                ? `${t.settings.system.sshFound} (${systemStatus.sshKeyType})`
                : t.settings.system.sshNotFound
            }
            optional
          />
        </div>

        {/* Diagnostics Button */}
        <div className="mt-6 pt-4 border-t border-terminal-border">
          <button
            onClick={handleRunDiagnostics}
            disabled={diagnosticsLoading}
            className="btn-primary w-full flex items-center justify-center space-x-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>
              {diagnosticsLoading
                ? <AnimatedDots text={t.settings.diagnostics.running} />
                : t.settings.diagnostics.runDiagnostics
              }
            </span>
          </button>
        </div>
      </div>

      {/* Diagnostics Modal */}
      {showDiagnosticsModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-terminal-bgLight border border-terminal-border rounded-lg w-full max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-terminal-border">
              <h3 className="text-lg font-semibold text-terminal-green">
                {t.settings.diagnostics.title}
              </h3>
              <button
                onClick={() => setShowDiagnosticsModal(false)}
                className="text-terminal-textMuted hover:text-terminal-text"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {diagnosticsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-terminal-green border-t-transparent"></div>
                    <p className="mt-4 text-terminal-textMuted">
                      <AnimatedDots text={t.settings.diagnostics.running} />
                    </p>
                  </div>
                </div>
              ) : diagnosticsResult ? (
                <div className="space-y-4">
                  {/* System Info */}
                  <div className="bg-terminal-bg rounded p-3 text-sm">
                    <div className="grid grid-cols-3 gap-4 text-terminal-textMuted">
                      <div>
                        <span className="text-terminal-text">{t.settings.diagnostics.timestamp}:</span>{' '}
                        {new Date(diagnosticsResult.timestamp).toLocaleString(language === 'pt-BR' ? 'pt-BR' : 'en-US')}
                      </div>
                      <div>
                        <span className="text-terminal-text">{t.settings.diagnostics.user}:</span>{' '}
                        {diagnosticsResult.system.user}
                      </div>
                      <div>
                        <span className="text-terminal-text">{t.settings.diagnostics.platform}:</span>{' '}
                        {diagnosticsResult.system.platform}
                      </div>
                    </div>
                  </div>

                  {/* Summary */}
                  <div className={`rounded p-4 border ${
                    diagnosticsResult.summary.errors > 0
                      ? 'bg-terminal-red/10 border-terminal-red/30'
                      : diagnosticsResult.summary.warnings > 0
                        ? 'bg-terminal-yellow/10 border-terminal-yellow/30'
                        : 'bg-terminal-green/10 border-terminal-green/30'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-terminal-text">{t.settings.diagnostics.summary}</span>
                      <div className="flex items-center space-x-4 text-sm">
                        {diagnosticsResult.summary.errors > 0 && (
                          <span className="text-terminal-red">
                            {diagnosticsResult.summary.errors} {t.settings.diagnostics.errors}
                          </span>
                        )}
                        {diagnosticsResult.summary.warnings > 0 && (
                          <span className="text-terminal-yellow">
                            {diagnosticsResult.summary.warnings} {t.settings.diagnostics.warnings}
                          </span>
                        )}
                        {diagnosticsResult.summary.errors === 0 && diagnosticsResult.summary.warnings === 0 && (
                          <span className="text-terminal-green">{t.settings.diagnostics.allOk}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Checks */}
                  <div className="space-y-3">
                    {diagnosticsResult.checks.map((check, index) => (
                      <DiagnosticCheckItem key={index} check={check} t={t} />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="p-4 border-t border-terminal-border">
              <button
                onClick={() => setShowDiagnosticsModal(false)}
                className="btn-secondary w-full"
              >
                {t.settings.diagnostics.close}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Configuration */}
      {config && (
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-terminal-text mb-4">
            <span className="text-terminal-green">#</span> {t.settings.config.title}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ConfigItem label={t.settings.config.backendPort} value={config.port} />
            <ConfigItem label={t.settings.config.frontendPort} value={config.frontendPort} />
            <ConfigItem label={t.settings.config.environment} value={config.nodeEnv} />
            <ConfigItem label={t.settings.config.redisUrl} value={config.redisUrl} />
            <ConfigItem label={t.settings.config.defaultCpu} value={`${config.defaultCpuLimit} cores`} />
            <ConfigItem label={t.settings.config.defaultMemory} value={`${config.defaultMemoryLimit} MB`} />
            <ConfigItem label={t.settings.config.defaultDisk} value={`${config.defaultDiskLimit} MB`} />
          </div>
          <p className="mt-4 text-sm text-terminal-textMuted">
            {t.settings.config.editConfig} <code className="bg-terminal-bg px-2 py-1 rounded text-terminal-green">~/.config/claude-docker-web/config.env</code>
          </p>
        </div>
      )}
    </div>
  )
}

function StatusItem({
  label,
  status,
  description,
  optional = false
}: {
  label: string
  status: boolean
  description: string
  optional?: boolean
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-terminal-border last:border-0">
      <div className="flex items-center space-x-3">
        <div className={`status-dot ${
          status
            ? 'status-running'
            : optional
              ? 'status-creating'
              : 'status-error'
        }`} />
        <span className="font-medium text-terminal-text">{label}</span>
      </div>
      <span className="text-sm text-terminal-textMuted">{description}</span>
    </div>
  )
}

function ConfigItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-terminal-textMuted">{label}</span>
      <span className="text-sm font-medium text-terminal-green">{value}</span>
    </div>
  )
}

function DiagnosticCheckItem({ check, t }: { check: DiagnosticCheck; t: any }) {
  const [expanded, setExpanded] = useState(false)
  const hasDetails = (check.details && check.details.length > 0) || (check.fixInstructions && check.fixInstructions.length > 0)

  const statusColors = {
    ok: 'text-terminal-green',
    warning: 'text-terminal-yellow',
    error: 'text-terminal-red',
  }

  const statusBgColors = {
    ok: 'bg-terminal-green/10 border-terminal-green/30',
    warning: 'bg-terminal-yellow/10 border-terminal-yellow/30',
    error: 'bg-terminal-red/10 border-terminal-red/30',
  }

  const statusIcons = {
    ok: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    ),
    warning: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
    error: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    ),
  }

  return (
    <div className={`rounded border ${statusBgColors[check.status]}`}>
      <button
        onClick={() => hasDetails && setExpanded(!expanded)}
        className={`w-full p-3 flex items-center justify-between ${hasDetails ? 'cursor-pointer' : 'cursor-default'}`}
        disabled={!hasDetails}
      >
        <div className="flex items-center space-x-3">
          <span className={statusColors[check.status]}>
            {statusIcons[check.status]}
          </span>
          <div className="text-left">
            <span className="font-medium text-terminal-text">{check.name}</span>
            <p className="text-sm text-terminal-textMuted">{check.message}</p>
          </div>
        </div>
        {hasDetails && (
          <svg
            className={`w-5 h-5 text-terminal-textMuted transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {expanded && hasDetails && (
        <div className="px-3 pb-3 space-y-3 border-t border-terminal-border/30 pt-3">
          {check.details && check.details.length > 0 && (
            <div>
              <p className="text-xs font-medium text-terminal-textMuted mb-2">{t.settings.diagnostics.details}</p>
              <ul className="text-sm text-terminal-text space-y-1 font-mono">
                {check.details.map((detail, i) => (
                  <li key={i}>{detail}</li>
                ))}
              </ul>
            </div>
          )}

          {check.fixInstructions && check.fixInstructions.length > 0 && (
            <div>
              <p className="text-xs font-medium text-terminal-yellow mb-2">{t.settings.diagnostics.fixInstructions}</p>
              <div className="bg-terminal-bg rounded p-2 space-y-1">
                {check.fixInstructions.map((instruction, i) => (
                  <code key={i} className="block text-sm text-terminal-green font-mono">
                    $ {instruction}
                  </code>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
