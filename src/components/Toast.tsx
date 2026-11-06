import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useI18n } from '../i18n/I18n'

interface ToastMessage {
  text: string
  action?: { label: string; run: () => void }
  /** ms; 0 keeps it until dismissed. */
  duration?: number
}

const ToastContext = createContext<(m: ToastMessage) => void>(() => undefined)

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n()
  const [msg, setMsg] = useState<ToastMessage | null>(null)
  const show = useCallback((m: ToastMessage) => setMsg(m), [])

  useEffect(() => {
    if (!msg || msg.duration === 0) return
    const timer = window.setTimeout(() => setMsg(null), msg.duration ?? 4000)
    return () => window.clearTimeout(timer)
  }, [msg])

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div aria-live="polite" role="status">
        {msg && (
          <div className="toast">
            <span>{msg.text}</span>
            <span>
              {msg.action && (
                <button
                  type="button"
                  className="btn btn--quiet"
                  onClick={() => {
                    msg.action!.run()
                    setMsg(null)
                  }}
                >
                  {msg.action.label}
                </button>
              )}
              <button type="button" className="btn btn--quiet" onClick={() => setMsg(null)}>
                {t.pwa.dismiss}
              </button>
            </span>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  )
}
