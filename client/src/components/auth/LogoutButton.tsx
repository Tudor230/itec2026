import { useAuth0 } from '@auth0/auth0-react'
import { useAuthRuntime } from '../../auth/AuthProvider'
import { auth0Config } from '../../lib/auth0-config'

interface LogoutButtonProps {
  className?: string
}

const defaultClassName =
  'rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-4 py-2 text-sm font-semibold text-[var(--sea-ink)] shadow-[0_8px_22px_rgba(30,90,72,0.08)] transition hover:-translate-y-0.5'

function AuthenticatedLogoutButton({
  className = defaultClassName,
}: LogoutButtonProps) {
  const { logout } = useAuth0()

  return (
    <button
      type="button"
      onClick={() =>
        logout({
          logoutParams: {
            returnTo: auth0Config.logoutReturnTo,
          },
        })
      }
      className={className}
    >
      Log out
    </button>
  )
}

export default function LogoutButton(props: LogoutButtonProps) {
  const { isConfigured } = useAuthRuntime()

  if (!isConfigured) {
    return null
  }

  return <AuthenticatedLogoutButton {...props} />
}