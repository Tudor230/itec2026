import { useAuth0 } from '@auth0/auth0-react'
import { useAuthRuntime } from '../../auth/AuthProvider'
import { getUserRoles } from '../../lib/auth-claims'

interface UserInfoProps {
  compact?: boolean
}

function AuthenticatedUserInfo({ compact = false }: UserInfoProps) {
  const { isAuthenticated, isLoading, user } = useAuth0()

  if (isLoading || !isAuthenticated || !user) {
    return null
  }

  const displayName = user.name || user.nickname || user.email || 'Authenticated user'
  const secondaryText = user.email || user.sub || 'Auth0 user'
  const roles = getUserRoles(user)

  if (compact) {
    return (
      <div className="hidden items-center gap-3 rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-3 py-1.5 text-left text-xs text-[var(--sea-ink-soft)] shadow-[0_8px_22px_rgba(30,90,72,0.08)] lg:flex">
        {user.picture ? (
          <img
            src={user.picture}
            alt={displayName}
            className="h-8 w-8 rounded-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : null}
        <div>
          <p className="m-0 font-semibold text-[var(--sea-ink)]">{displayName}</p>
          <p className="m-0">{secondaryText}</p>
        </div>
      </div>
    )
  }

  return (
    <section className="island-shell rounded-2xl p-6">
      <p className="island-kicker mb-2">Authenticated User</p>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {user.picture ? (
          <img
            src={user.picture}
            alt={displayName}
            className="h-16 w-16 rounded-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : null}
        <div>
          <h2 className="m-0 text-2xl font-semibold text-[var(--sea-ink)]">
            {displayName}
          </h2>
          <p className="mb-1 mt-2 text-sm text-[var(--sea-ink-soft)]">
            {secondaryText}
          </p>
          <p className="mb-1 text-sm text-[var(--sea-ink-soft)]">
            Roles: {roles.length > 0 ? roles.join(', ') : 'No roles found in the Auth0 user claims.'}
          </p>
          <p className="m-0 text-sm text-[var(--sea-ink-soft)]">
            User information comes from the Auth0 React SDK session.
          </p>
        </div>
      </div>
    </section>
  )
}

export default function UserInfo(props: UserInfoProps) {
  const { isConfigured } = useAuthRuntime()

  if (!isConfigured) {
    return null
  }

  return <AuthenticatedUserInfo {...props} />
}