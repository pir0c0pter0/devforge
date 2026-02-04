'use client'

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react'
import clsx from 'clsx'
import { X, AlertTriangle, AlertCircle, CheckCircle, Info, Trash2 } from 'lucide-react'

// Types
type ModalType = 'confirm' | 'error' | 'warning' | 'success' | 'info' | 'delete'

interface ModalButton {
  label: string
  onClick: () => void
  variant?: 'primary' | 'secondary' | 'danger'
  autoFocus?: boolean
}

interface ModalOptions {
  type?: ModalType
  title: string
  message: string | ReactNode
  details?: string // Para detalhes técnicos (ex: stack trace)
  buttons?: ModalButton[]
  onClose?: () => void
  closable?: boolean // Se pode fechar clicando fora ou no X
}

interface ConfirmOptions {
  title: string
  message: string | ReactNode
  confirmLabel?: string
  cancelLabel?: string
  type?: 'confirm' | 'delete' | 'warning'
}

interface ModalContextType {
  showModal: (options: ModalOptions) => void
  showError: (title: string, message: string, details?: string) => void
  showSuccess: (title: string, message: string) => void
  showWarning: (title: string, message: string) => void
  showInfo: (title: string, message: string) => void
  confirm: (options: ConfirmOptions) => Promise<boolean>
  closeModal: () => void
}

const ModalContext = createContext<ModalContextType | null>(null)

export function ModalProvider({ children }: { children: ReactNode }) {
  const [modalOptions, setModalOptions] = useState<ModalOptions | null>(null)
  const [confirmResolve, setConfirmResolve] = useState<((value: boolean) => void) | null>(null)

  const closeModal = useCallback(() => {
    if (modalOptions?.onClose) {
      modalOptions.onClose()
    }
    setModalOptions(null)
    if (confirmResolve) {
      confirmResolve(false)
      setConfirmResolve(null)
    }
  }, [modalOptions, confirmResolve])

  const showModal = useCallback((options: ModalOptions) => {
    setModalOptions({ closable: true, ...options })
  }, [])

  const showError = useCallback((title: string, message: string, details?: string) => {
    showModal({
      type: 'error',
      title,
      message,
      details,
      closable: true,
      buttons: [
        {
          label: 'Fechar',
          onClick: () => setModalOptions(null),
          variant: 'secondary',
          autoFocus: true,
        },
      ],
    })
  }, [showModal])

  const showSuccess = useCallback((title: string, message: string) => {
    showModal({
      type: 'success',
      title,
      message,
      closable: true,
      buttons: [
        {
          label: 'OK',
          onClick: () => setModalOptions(null),
          variant: 'primary',
          autoFocus: true,
        },
      ],
    })
  }, [showModal])

  const showWarning = useCallback((title: string, message: string) => {
    showModal({
      type: 'warning',
      title,
      message,
      closable: true,
      buttons: [
        {
          label: 'OK',
          onClick: () => setModalOptions(null),
          variant: 'secondary',
          autoFocus: true,
        },
      ],
    })
  }, [showModal])

  const showInfo = useCallback((title: string, message: string) => {
    showModal({
      type: 'info',
      title,
      message,
      closable: true,
      buttons: [
        {
          label: 'OK',
          onClick: () => setModalOptions(null),
          variant: 'primary',
          autoFocus: true,
        },
      ],
    })
  }, [showModal])

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirmResolve(() => resolve)

      const modalType: ModalType = options.type === 'delete' ? 'delete' : options.type === 'warning' ? 'warning' : 'confirm'

      setModalOptions({
        type: modalType,
        title: options.title,
        message: options.message,
        closable: true,
        buttons: [
          {
            label: options.cancelLabel || 'Cancelar',
            onClick: () => {
              resolve(false)
              setModalOptions(null)
              setConfirmResolve(null)
            },
            variant: 'secondary',
          },
          {
            label: options.confirmLabel || 'Confirmar',
            onClick: () => {
              resolve(true)
              setModalOptions(null)
              setConfirmResolve(null)
            },
            variant: options.type === 'delete' ? 'danger' : 'primary',
            autoFocus: options.type !== 'delete', // Não foca no botão perigoso
          },
        ],
      })
    })
  }, [])

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && modalOptions?.closable) {
        closeModal()
      }
    }

    if (modalOptions) {
      document.addEventListener('keydown', handleEscape)
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [modalOptions, closeModal])

  return (
    <ModalContext.Provider
      value={{ showModal, showError, showSuccess, showWarning, showInfo, confirm, closeModal }}
    >
      {children}
      {modalOptions && (
        <ModalOverlay
          options={modalOptions}
          onClose={modalOptions.closable ? closeModal : undefined}
        />
      )}
    </ModalContext.Provider>
  )
}

export function useModal(): ModalContextType {
  const context = useContext(ModalContext)
  if (!context) {
    throw new Error('useModal must be used within a ModalProvider')
  }
  return context
}

// Modal Overlay Component
interface ModalOverlayProps {
  options: ModalOptions
  onClose?: () => void
}

function ModalOverlay({ options, onClose }: ModalOverlayProps) {
  const { type = 'info', title, message, details, buttons } = options

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && onClose) {
      onClose()
    }
  }

  const typeConfig = {
    confirm: {
      icon: <Info className="w-6 h-6" />,
      iconBg: 'bg-terminal-cyan/20',
      iconColor: 'text-terminal-cyan',
      borderColor: 'border-terminal-cyan/30',
    },
    error: {
      icon: <AlertCircle className="w-6 h-6" />,
      iconBg: 'bg-terminal-red/20',
      iconColor: 'text-terminal-red',
      borderColor: 'border-terminal-red/30',
    },
    warning: {
      icon: <AlertTriangle className="w-6 h-6" />,
      iconBg: 'bg-terminal-yellow/20',
      iconColor: 'text-terminal-yellow',
      borderColor: 'border-terminal-yellow/30',
    },
    success: {
      icon: <CheckCircle className="w-6 h-6" />,
      iconBg: 'bg-terminal-green/20',
      iconColor: 'text-terminal-green',
      borderColor: 'border-terminal-green/30',
    },
    info: {
      icon: <Info className="w-6 h-6" />,
      iconBg: 'bg-terminal-cyan/20',
      iconColor: 'text-terminal-cyan',
      borderColor: 'border-terminal-cyan/30',
    },
    delete: {
      icon: <Trash2 className="w-6 h-6" />,
      iconBg: 'bg-terminal-red/20',
      iconColor: 'text-terminal-red',
      borderColor: 'border-terminal-red/30',
    },
  }

  const config = typeConfig[type]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={handleBackdropClick}
    >
      <div
        className={clsx(
          'relative w-full max-w-md bg-terminal-bgLight border rounded-lg shadow-2xl animate-scale-in',
          config.borderColor
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        {/* Close button */}
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1 text-terminal-textMuted hover:text-terminal-text rounded-lg hover:bg-terminal-border transition-colors"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        <div className="p-6">
          {/* Icon and Title */}
          <div className="flex items-start gap-4">
            <div className={clsx('flex-shrink-0 p-2 rounded-full', config.iconBg, config.iconColor)}>
              {config.icon}
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <h3
                id="modal-title"
                className="text-lg font-semibold text-terminal-text"
              >
                {title}
              </h3>
            </div>
          </div>

          {/* Message */}
          <div className="mt-4 ml-14">
            {typeof message === 'string' ? (
              <p className="text-sm text-terminal-textMuted leading-relaxed">{message}</p>
            ) : (
              message
            )}
          </div>

          {/* Details (collapsible for errors) */}
          {details && (
            <details className="mt-4 ml-14">
              <summary className="text-xs text-terminal-textMuted cursor-pointer hover:text-terminal-text">
                Detalhes técnicos
              </summary>
              <pre className="mt-2 p-3 text-xs bg-terminal-bg rounded border border-terminal-border overflow-x-auto max-h-40 text-terminal-red font-mono">
                {details}
              </pre>
            </details>
          )}

          {/* Buttons */}
          {buttons && buttons.length > 0 && (
            <div className="mt-6 flex justify-end gap-3">
              {buttons.map((button, index) => (
                <ModalButton key={index} {...button} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Modal Button Component
function ModalButton({ label, onClick, variant = 'secondary', autoFocus }: ModalButton) {
  const variants = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    danger: 'btn-danger',
  }

  return (
    <button
      onClick={onClick}
      className={clsx(variants[variant], 'text-sm px-4 py-2')}
      autoFocus={autoFocus}
    >
      {label}
    </button>
  )
}
