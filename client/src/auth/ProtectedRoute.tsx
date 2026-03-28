import { useAuth0 } from '@auth0/auth0-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useAuthRuntime } from './AuthProvider'
import AuthSetupNotice from '../components/auth/AuthSetupNotice'
import { auth0Config } from '../lib/auth0-config'
import { getUserRoles, hasRequiredRoles } from '../lib/auth-claims'

interface ProtectedRouteProps {
  children: ReactNode
  requiredRoles?: string[]
  match?: 'all' | 'any'
}

function UnauthorizedMessage({ requiredRoles }: { requiredRoles: string[] }) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[linear-gradient(165deg,var(--surface-strong),var(--surface))] p-6 text-sm text-[var(--sea-ink-soft)] shadow-[inset_0_1px_0_var(--inset-glint),0_22px_44px_rgba(30,90,72,0.1),0_6px_18px_rgba(23,58,64,0.08)] backdrop-blur-[4px]">
      You are signed in, but you do not have access to this page.
      {requiredRoles.length > 0 ? (
        <div className="mt-3 text-xs uppercase tracking-[0.12em] text-[var(--kicker)]">
          Required roles: {requiredRoles.join(', ')}
        </div>
      ) : null}
    </div>
  )
}

function ProtectedRouteContent({
  children,
  requiredRoles = [],
  match = 'all',
}: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, loginWithRedirect, error, user } = useAuth0()
  const [loginStarted, setLoginStarted] = useState(false)

  useEffect(() => {
    if (isLoading || isAuthenticated || loginStarted) {
      return
    }

    setLoginStarted(true)

    void loginWithRedirect({
      appState: {
        returnTo: '/projects',
      },
      authorizationParams: {
        redirect_uri: auth0Config.redirectUri,
        audience: auth0Config.audience,
      },
    })
  }, [isAuthenticated, isLoading, loginStarted, loginWithRedirect])

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-[var(--line)] bg-[linear-gradient(165deg,var(--surface-strong),var(--surface))] p-6 text-sm text-[var(--sea-ink-soft)] shadow-[inset_0_1px_0_var(--inset-glint),0_22px_44px_rgba(30,90,72,0.1),0_6px_18px_rgba(23,58,64,0.08)] backdrop-blur-[4px]">
        Checking your Auth0 session...
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-[var(--line)] bg-[linear-gradient(165deg,var(--surface-strong),var(--surface))] p-6 text-sm text-[var(--sea-ink-soft)] shadow-[inset_0_1px_0_var(--inset-glint),0_22px_44px_rgba(30,90,72,0.1),0_6px_18px_rgba(23,58,64,0.08)] backdrop-blur-[4px]">
        Auth0 returned an error: {error.message}
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="rounded-2xl border border-[var(--line)] bg-[linear-gradient(165deg,var(--surface-strong),var(--surface))] p-6 text-sm text-[var(--sea-ink-soft)] shadow-[inset_0_1px_0_var(--inset-glint),0_22px_44px_rgba(30,90,72,0.1),0_6px_18px_rgba(23,58,64,0.08)] backdrop-blur-[4px]">
        Redirecting you to Auth0 login...
      </div>
    )
  }

  const userRoles = getUserRoles(user)

  if (!hasRequiredRoles(userRoles, requiredRoles, match)) {
    return <UnauthorizedMessage requiredRoles={requiredRoles} />
  }

  return <>{children}</>
}

export default function ProtectedRoute(props: ProtectedRouteProps) {
  const { isConfigured } = useAuthRuntime()

  if (!isConfigured) {
    return <AuthSetupNotice />
  }

  return <ProtectedRouteContent {...props} />
}
