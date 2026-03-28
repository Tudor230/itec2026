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
  return (
    <div>
      <p className="island-kicker mb-2">Authentication</p>
      <h2 className="mb-4 text-2xl font-semibold text-[var(--sea-ink)]">
        {title}
      </h2>

      <div className="workspace-auth-tabs">
        <button
          type="button"
          onClick={() => onModeChange('login')}
          className={`workspace-auth-tab ${mode === 'login' ? 'is-active' : ''}`}
        >
          Log in
        </button>
        <button
          type="button"
          onClick={() => onModeChange('register')}
          className={`workspace-auth-tab ${mode === 'register' ? 'is-active' : ''}`}
        >
          Register
        </button>
      </div>

      <button
        type="button"
        disabled={isLoading}
        onClick={() => onStartAuth(mode)}
        className="workspace-auth-primary"
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

      <p className="workspace-auth-divider">or use social login</p>

      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          disabled={isLoading}
          onClick={() => onStartAuth(mode, 'google-oauth2')}
          className="workspace-auth-secondary"
        >
          Continue with Google
        </button>
        <button
          type="button"
          disabled={isLoading}
          onClick={() => onStartAuth(mode, 'github')}
          className="workspace-auth-secondary"
        >
          Continue with GitHub
        </button>
      </div>

      <button
        type="button"
        disabled={isLoading}
        onClick={() => onStartAuth('login')}
        className="workspace-auth-link"
      >
        Back to login
      </button>

      {errorMessage ? (
        <div className="workspace-auth-error" role="alert">
          <AlertCircle size={15} />
          <span>{errorMessage}</span>
        </div>
      ) : null}
    </div>
  )
}
