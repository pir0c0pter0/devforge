'use client'

import { useState, type FormEvent } from 'react'
import Image from 'next/image'
import { useAuth } from '@/contexts/AuthContext'
import { AnimatedDots } from '@/components/ui/animated-dots'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const { login, isLoading, error, clearError } = useAuth()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    clearError()

    if (!username.trim() || !password.trim()) {
      return
    }

    await login(username, password)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-terminal-bg py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <Image
            src="/logo-full.png"
            alt="DevForge"
            width={192}
            height={192}
            className="mx-auto mb-4"
          />
          <p className="mt-2 text-sm text-terminal-textMuted">
            Sign in to manage your containers
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="card p-6 space-y-4">
            {error && (
              <div className="bg-terminal-red/10 border border-terminal-red/30 rounded-lg p-4">
                <div className="flex items-center">
                  <svg
                    className="w-5 h-5 text-terminal-red mr-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <p className="text-sm text-terminal-red">{error}</p>
                </div>
              </div>
            )}

            <div>
              <label htmlFor="username" className="label">
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                required
                className="input"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <div>
              <label htmlFor="password" className="label">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="input"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <button
              type="submit"
              className="btn-primary w-full flex items-center justify-center"
              disabled={isLoading}
            >
              {isLoading ? (
                <AnimatedDots text="Signing in" />
              ) : (
                'Sign in'
              )}
            </button>
          </div>
        </form>

        <p className="text-center text-xs text-terminal-textMuted">
          Container orchestration with Claude AI
        </p>
      </div>
    </div>
  )
}
