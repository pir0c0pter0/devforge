'use client'

import { CreateContainerForm } from '@/components/create-container-form'
import { useI18n } from '@/lib/i18n'

export default function NewContainerPage() {
  const { t } = useI18n()

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-terminal-green terminal-glow mb-2">
          <span className="text-terminal-textMuted">$</span> {t.createContainer.title}
        </h2>
        <p className="text-terminal-textMuted">
          {t.createContainer.subtitle}
        </p>
      </div>

      <div className="card p-6">
        <CreateContainerForm />
      </div>
    </div>
  )
}
