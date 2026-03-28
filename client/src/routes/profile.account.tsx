import { useAuth0 } from '@auth0/auth0-react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { LogOut, UserRound } from 'lucide-react'
import ProtectedRoute from '../auth/ProtectedRoute'
import ProfilePageFrame from '../components/profile/ProfilePageFrame'
import { getUserRoles } from '../lib/auth-claims'
import { auth0Config } from '../lib/auth0-config'

export const Route = createFileRoute('/profile/account')({
  component: ProfileAccountRoute,
})

function ProfileAccountRoute() {
  const { user, logout } = useAuth0()

  const displayName = user?.name || user?.nickname || user?.email || 'Authenticated user'
  const displayEmail = user?.email || user?.sub || 'No email available'
  const roles = getUserRoles(user)

  return (
    <ProtectedRoute>
      <ProfilePageFrame
        title="Account"
        description="Manage your personal account details and workspace identity."
      >
        <section className="rounded-2xl border border-[var(--line)] bg-[var(--chip-bg)] p-5">
          <div className="flex flex-wrap items-start gap-4">
            {user?.picture ? (
              <img
                src={user.picture}
                alt={displayName}
                className="h-14 w-14 rounded-full border border-[var(--line)] object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="inline-flex h-14 w-14 items-center justify-center rounded-full border border-[var(--line)] bg-[rgba(var(--lagoon-rgb),0.14)]">
                <UserRound size={22} />
              </span>
            )}

            <div>
              <p className="m-0 text-xl font-semibold text-[var(--sea-ink)]">{displayName}</p>
              <p className="m-0 mt-1 text-sm text-[var(--sea-ink-soft)]">{displayEmail}</p>
              {roles.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {roles.map((role) => (
                    <span
                      key={role}
                      className="rounded-full border border-[var(--chip-line)] bg-[rgba(var(--lagoon-rgb),0.12)] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.09em] text-[var(--lagoon-deep)]"
                    >
                      {role}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              to="/projects"
              className="rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-4 py-2 text-sm font-semibold text-[var(--sea-ink)] no-underline"
            >
              Open Projects
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
        </section>
      </ProfilePageFrame>
    </ProtectedRoute>
  )
}
