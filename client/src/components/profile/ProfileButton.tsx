import { useAuth0 } from '@auth0/auth0-react'
import { Link } from '@tanstack/react-router'
import { LogOut, Settings2, UserRound, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuthRuntime } from '../../auth/AuthProvider'
import { auth0Config } from '../../lib/auth0-config'
import ThemePresetPicker from './ThemePresetPicker'

function AuthenticatedProfileButton() {
  const { isAuthenticated, isLoading, user, logout } = useAuth0()
  const [isOpen, setIsOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const modalRef = useRef<HTMLElement | null>(null)

  const displayName = useMemo(() => {
    if (!user) {
      return 'Authenticated user'
    }

    return user.name || user.nickname || user.email || 'Authenticated user'
  }, [user])

  const displayEmail = user?.email ?? user?.sub ?? 'No email available'

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const focusableSelector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

    const getFocusable = () => {
      if (!modalRef.current) {
        return [] as HTMLElement[]
      }

      return Array.from(modalRef.current.querySelectorAll<HTMLElement>(focusableSelector))
    }

    const initialFocusable = getFocusable()
    initialFocusable[0]?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
        return
      }

      if (event.key !== 'Tab') {
        return
      }

      const focusable = getFocusable()
      if (focusable.length === 0) {
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement

      if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
        return
      }

      if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      triggerRef.current?.focus()
    }
  }, [isOpen])

  const canUseAccountActions = !isLoading && isAuthenticated && Boolean(user)

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-3 py-1.5 text-sm font-semibold text-[var(--sea-ink)] shadow-[0_8px_22px_rgba(30,90,72,0.08)]"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label="Open profile menu"
      >
        {canUseAccountActions && user?.picture ? (
          <img
            src={user.picture}
            alt={displayName}
            className="h-7 w-7 rounded-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[rgba(79,184,178,0.18)]">
            <UserRound size={14} />
          </span>
        )}
        <span>Profile</span>
      </button>

      {isOpen ? (
        <div
          className="fixed inset-0 z-[70] grid place-items-center bg-[rgba(6,15,21,0.5)] p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="profile-modal-title"
          onClick={() => setIsOpen(false)}
        >
          <section
            ref={modalRef}
            className="relative w-[min(560px,calc(100%-1.25rem))] rounded-2xl border border-[var(--line)] bg-[linear-gradient(165deg,var(--surface-strong),var(--surface))] p-4 shadow-[inset_0_1px_0_var(--inset-glint),0_24px_45px_rgba(10,25,31,0.28)]"
            onClick={(event) => {
              event.stopPropagation()
            }}
          >
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="absolute right-[0.6rem] top-[0.6rem] inline-flex h-[1.9rem] w-[1.9rem] items-center justify-center rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] text-[var(--sea-ink-soft)]"
              aria-label="Close profile modal"
            >
              <X size={16} />
            </button>

            <div className="mb-4">
              {canUseAccountActions ? (
                <>
                  <p id="profile-modal-title" className="m-0 text-xl font-semibold text-[var(--sea-ink)]">
                    {displayName}
                  </p>
                  <p className="m-0 mt-1 text-sm text-[var(--sea-ink-soft)]">{displayEmail}</p>
                </>
              ) : (
                <>
                  <p id="profile-modal-title" className="m-0 text-xl font-semibold text-[var(--sea-ink)]">
                    Sign in to your profile
                  </p>
                  <p className="m-0 mt-1 text-sm text-[var(--sea-ink-soft)]">
                    Access account settings, theme presets, and logout actions.
                  </p>
                </>
              )}
            </div>

            <div className="mb-4">
              <p className="mb-2 text-[0.69rem] font-bold uppercase tracking-[0.16em] text-[var(--kicker)]">Theme</p>
              <ThemePresetPicker compact />
            </div>

            {canUseAccountActions ? (
              <div className="flex flex-wrap gap-2">
                <Link
                  to="/profile"
                  onClick={() => setIsOpen(false)}
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-4 py-2 text-sm font-semibold text-[var(--sea-ink)] no-underline"
                >
                  <Settings2 size={14} />
                  Settings
                </Link>
                <button
                  type="button"
                  onClick={() =>
                    logout({
                      logoutParams: {
                        returnTo: auth0Config.logoutReturnTo,
                      },
                    })
                  }
                  className="inline-flex items-center gap-2 rounded-full border border-[rgba(203,89,89,0.35)] bg-[rgba(203,89,89,0.12)] px-4 py-2 text-sm font-semibold text-[var(--sea-ink)]"
                >
                  <LogOut size={14} />
                  Log out
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Link
                  to="/auth"
                  search={{ mode: 'login' }}
                  onClick={() => setIsOpen(false)}
                  className="inline-flex items-center gap-2 rounded-full border border-[rgba(50,143,151,0.35)] bg-[rgba(79,184,178,0.14)] px-4 py-2 text-sm font-semibold text-[var(--lagoon-deep)] no-underline"
                >
                  Sign in
                </Link>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </>
  )
}

export default function ProfileButton() {
  const { isConfigured } = useAuthRuntime()

  if (!isConfigured) {
    return null
  }

  return <AuthenticatedProfileButton />
}
