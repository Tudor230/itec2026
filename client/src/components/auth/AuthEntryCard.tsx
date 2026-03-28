import { AlertCircle, LogIn, UserPlus } from 'lucide-react'

export type AuthMode = 'login' | 'register'

interface AuthEntryCardProps {
  title?: string
  mode: AuthMode
  isLoading: boolean
  errorMessage: string | null
  onModeChange: (mode: AuthMode) => void
  onStartAuth: (mode: AuthMode, connection?: 'google-oauth2' | 'github') => void
}

export default function AuthEntryCard({
  title = 'Continue to Projects',
  mode,
  isLoading,
  errorMessage,
  onModeChange,
  onStartAuth,
}: AuthEntryCardProps) {
  const tabButtonBase =
    'rounded-[0.68rem] border border-[var(--chip-line)] bg-[var(--chip-bg)] px-[0.6rem] py-[0.48rem] text-[0.82rem] font-bold text-[var(--sea-ink-soft)]'

  return (
    <div>
      <p className="mb-2 text-[0.69rem] font-bold uppercase tracking-[0.16em] text-[var(--kicker)]">Authentication</p>
      <h2 className="mb-4 text-2xl font-semibold text-[var(--sea-ink)]">
        {title}
      </h2>

      <div className="mb-[0.8rem] grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onModeChange('login')}
          className={`${tabButtonBase} ${mode === 'login' ? 'border-[color-mix(in_oklab,var(--lagoon-deep)_42%,var(--chip-line))] bg-[color-mix(in_oklab,var(--chip-bg)_76%,rgba(79,184,178,0.2)_24%)] text-[var(--sea-ink)]' : ''}`}
        >
          Log in
        </button>
        <button
          type="button"
          onClick={() => onModeChange('register')}
          className={`${tabButtonBase} ${mode === 'register' ? 'border-[color-mix(in_oklab,var(--lagoon-deep)_42%,var(--chip-line))] bg-[color-mix(in_oklab,var(--chip-bg)_76%,rgba(79,184,178,0.2)_24%)] text-[var(--sea-ink)]' : ''}`}
        >
          Register
        </button>
      </div>

      <button
        type="button"
        disabled={isLoading}
        onClick={() => onStartAuth(mode)}
        className="inline-flex w-full items-center justify-center gap-[0.45rem] rounded-full border border-[rgba(50,143,151,0.35)] bg-[rgba(79,184,178,0.16)] px-[0.9rem] py-[0.6rem] text-[0.88rem] font-bold text-[var(--lagoon-deep)] disabled:cursor-not-allowed disabled:opacity-65"
      >
        {mode === 'login' ? <LogIn size={15} /> : <UserPlus size={15} />}
        <span>
          {isLoading
            ? 'Redirecting...'
            : mode === 'login'
              ? 'Continue with Auth0'
              : 'Create account with Auth0'}
        </span>
      </button>

      <p className="my-[0.8rem] text-center text-[0.72rem] uppercase tracking-[0.11em] text-[var(--sea-ink-soft)]">or use social login</p>

      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          disabled={isLoading}
          onClick={() => onStartAuth(mode, 'google-oauth2')}
          className="rounded-[0.75rem] border border-[var(--chip-line)] bg-[var(--chip-bg)] px-[0.7rem] py-[0.53rem] text-[0.81rem] font-bold text-[var(--sea-ink)] disabled:cursor-not-allowed disabled:opacity-65"
        >
          Continue with Google
        </button>
        <button
          type="button"
          disabled={isLoading}
          onClick={() => onStartAuth(mode, 'github')}
          className="rounded-[0.75rem] border border-[var(--chip-line)] bg-[var(--chip-bg)] px-[0.7rem] py-[0.53rem] text-[0.81rem] font-bold text-[var(--sea-ink)] disabled:cursor-not-allowed disabled:opacity-65"
        >
          Continue with GitHub
        </button>
      </div>

      <button
        type="button"
        disabled={isLoading}
        onClick={() => onStartAuth('login')}
        className="mt-[0.62rem] border-0 bg-transparent p-0 text-[0.82rem] text-[var(--lagoon-deep)] underline underline-offset-2 disabled:cursor-not-allowed disabled:opacity-65"
      >
        Back to login
      </button>

      {errorMessage ? (
        <div className="mt-[0.7rem] inline-flex items-center gap-[0.45rem] rounded-xl border border-[color-mix(in_oklab,var(--line)_62%,#ff7373_38%)] bg-[color-mix(in_oklab,var(--surface)_72%,#ffe9e9_28%)] px-[0.7rem] py-[0.58rem] text-[0.82rem] text-[var(--sea-ink)] animate-in fade-in zoom-in-95 duration-200" role="alert">
          <AlertCircle size={15} />
          <span>{errorMessage}</span>
        </div>
      ) : null}
    </div>
  )
}
