import { useAuth0 } from '@auth0/auth0-react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useAuthRuntime } from '../auth/AuthProvider'
import AuthSetupNotice from '../components/auth/AuthSetupNotice'
import AuthEntryCard, { type AuthMode } from '../components/auth/AuthEntryCard'
import { auth0Config } from '../lib/auth0-config'

export const Route = createFileRoute('/auth')({
  validateSearch: (search: Record<string, unknown>) => {
    const modeRaw = typeof search.mode === 'string' ? search.mode : 'login'
    const mode: AuthMode = modeRaw === 'register' ? 'register' : 'login'

    return {
      mode,
    }
  },
  component: AuthRoute,
})

function AuthRoute() {
  const { isConfigured } = useAuthRuntime()

  if (!isConfigured) {
    return (
      <main className="page-wrap px-4 py-12">
        <AuthSetupNotice />
      </main>
    )
  }

  return <AuthRouteWithHostedAuth />
}

function AuthRouteWithHostedAuth() {
  const navigate = useNavigate()
  const {
    isAuthenticated,
    isLoading,
    loginWithRedirect,
    error,
  } = useAuth0()

  const search = Route.useSearch()
  const [authMode, setAuthMode] = useState<AuthMode>(search.mode)
  const [authPending, setAuthPending] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  useEffect(() => {
    setAuthMode(search.mode)
  }, [search.mode])

  useEffect(() => {
    if (isAuthenticated) {
      void navigate({ to: '/projects' })
    }
  }, [isAuthenticated, navigate])

  const startHostedAuth = async (
    mode: AuthMode,
    connection?: 'google-oauth2' | 'github',
  ) => {
    setAuthPending(true)
    setAuthError(null)

    try {
      await loginWithRedirect({
        appState: {
          returnTo: '/projects',
        },
        authorizationParams: {
          redirect_uri: auth0Config.redirectUri,
          screen_hint: mode === 'register' ? 'signup' : undefined,
          connection,
        },
      })
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : 'Could not start login flow.'

      setAuthError(message)
      setAuthPending(false)
    }
  }

  return (
    <main className="auth-page-shell px-4 py-12">
      <section className="workspace-auth-card mx-auto w-full max-w-[560px]">
        <p className="island-kicker mb-2">iTECify Access</p>
        <h1 className="mb-3 text-3xl font-bold text-[var(--sea-ink)]">
          Sign in to continue to your projects
        </h1>
        <p className="mb-5 text-sm leading-7 text-[var(--sea-ink-soft)]">
          Use the hosted Auth0 flow to access your account. After
          authentication, you will land on your projects hub.
        </p>

        <AuthEntryCard
          title="Continue to Projects"
          mode={authMode}
          isLoading={isLoading || authPending}
          errorMessage={authError ?? (error ? 'Authentication failed. Please try again.' : null)}
          onModeChange={(nextMode) => {
            setAuthMode(nextMode)
            setAuthError(null)
          }}
          onStartAuth={(mode, connection) => {
            void startHostedAuth(mode, connection)
          }}
        />
      </section>
    </main>
  )
}
