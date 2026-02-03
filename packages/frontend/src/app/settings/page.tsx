'use client'

import { useState, useEffect, useCallback } from 'react'
import { useI18n } from '@/lib/i18n'

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

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:8000'

export default function SettingsPage() {
  const { t, language, setLanguage } = useI18n()
  const [claudeStatus, setClaudeStatus] = useState<ClaudeStatus | null>(null)
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null)
  const [config, setConfig] = useState<Config | null>(null)
  const [loading, setLoading] = useState(true)
  const [authInstructions, setAuthInstructions] = useState<string[] | null>(null)
  const [sshGenerating, setSshGenerating] = useState(false)
  const [sshEmail, setSshEmail] = useState('')
  const [showSshForm, setShowSshForm] = useState(false)

  const fetchStatus = useCallback(async () => {
    try {
      const [claudeRes, systemRes, configRes] = await Promise.all([
        fetch(`${API_URL}/api/settings/claude-status`),
        fetch(`${API_URL}/api/settings/system-status`),
        fetch(`${API_URL}/api/settings/config`),
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
    if (!confirm(t.settings.claudeAuth.confirmLogout)) {
      return
    }

    try {
      const res = await fetch(`${API_URL}/api/settings/logout-claude`, {
        method: 'POST',
      })
      if (res.ok) {
        await fetchStatus()
      }
    } catch (error) {
      console.error('Failed to logout:', error)
    }
  }

  const handleGenerateSshKey = async () => {
    if (!sshEmail || !sshEmail.includes('@')) {
      alert(t.settings.github.emailInvalid)
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-terminal-green border-t-transparent"></div>
          <p className="mt-4 text-terminal-textMuted">{t.settings.loading}</p>
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
                    {sshGenerating ? t.settings.github.generating : t.settings.github.generateSsh}
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
      </div>

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
