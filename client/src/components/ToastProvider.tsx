import React, { createContext, useContext, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, CheckCircle2, AlertCircle, Info, Loader2 } from 'lucide-react'
import { cn } from '../lib/utils'

type ToastType = 'success' | 'error' | 'info' | 'loading'

interface Toast {
  id: string
  message: string
  type: ToastType
  duration?: number
}

interface ToastContextType {
  toast: (message: string, type?: ToastType, duration?: number) => void
  success: (message: string, duration?: number) => void
  error: (message: string, duration?: number) => void
  info: (message: string, duration?: number) => void
  loading: (message: string) => string
  dismiss: (id: string) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback((message: string, type: ToastType = 'info', duration = 4000) => {
    const id = Math.random().toString(36).substring(2, 9)
    setToasts((prev) => [...prev, { id, message, type, duration }])

    if (type !== 'loading') {
      setTimeout(() => dismiss(id), duration)
    }
    return id
  }, [dismiss])

  const success = useCallback((msg: string, dur?: number) => toast(msg, 'success', dur), [toast])
  const error = useCallback((msg: string, dur?: number) => toast(msg, 'error', dur), [toast])
  const info = useCallback((msg: string, dur?: number) => toast(msg, 'info', dur), [toast])
  const loading = useCallback((msg: string) => toast(msg, 'loading'), [toast])

  return (
    <ToastContext.Provider value={{ toast, success, error, info, loading, dismiss }}>
      {children}
      <div className="fixed bottom-12 right-6 z-[200] flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 20, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
              className={cn(
                "pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border shadow-2xl min-w-[280px] max-w-md bg-[rgba(var(--bg-rgb),0.85)] backdrop-blur-xl",
                t.type === 'success' && "border-green-500/30",
                t.type === 'error' && "border-red-500/30",
                t.type === 'info' && "border-[var(--lagoon)]/30",
                t.type === 'loading' && "border-[var(--line)]"
              )}
            >
              <div className={cn(
                "shrink-0",
                t.type === 'success' && "text-green-500",
                t.type === 'error' && "text-red-500",
                t.type === 'info' && "text-[var(--lagoon)]",
                t.type === 'loading' && "text-[var(--sea-ink-soft)] animate-spin"
              )}>
                {t.type === 'success' && <CheckCircle2 size={18} />}
                {t.type === 'error' && <AlertCircle size={18} />}
                {t.type === 'info' && <Info size={18} />}
                {t.type === 'loading' && <Loader2 size={18} />}
              </div>
              
              <p className="flex-1 text-xs font-bold text-[var(--sea-ink)]">{t.message}</p>
              
              <button 
                onClick={() => dismiss(t.id)}
                className="p-1 hover:bg-[rgba(0,0,0,0.05)] rounded-md text-[var(--sea-ink-soft)] transition-colors"
              >
                <X size={14} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}
