import { useAuth0 } from '@auth0/auth0-react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { LogOut } from 'lucide-react'
import ProtectedRoute from '../auth/ProtectedRoute'
import { auth0Config } from '../lib/auth0-config'
import ThemePresetPicker from '../components/profile/ThemePresetPicker'

export const Route = createFileRoute('/profile')({
  component: ProfileRoute,
})

function ProfileRoute() {
  const { user, logout } = useAuth0()

  const displayName = user?.name || user?.nickname || user?.email || 'Authenticated user'
  const displayEmail = user?.email || user?.sub || 'No email available'

  return (
    <ProtectedRoute>
      <main className="page-wrap px-4 py-10 sm:py-12">
        <section className="island-shell rounded-[1.8rem] p-6 sm:p-8">
          <p className="island-kicker mb-2">Profile</p>
          <h1 className="display-title mb-5 text-4xl font-bold text-[var(--sea-ink)] sm:text-5xl">
            Account and workspace preferences
          </h1>

          <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
            <section className="rounded-2xl border border-[var(--line)] bg-[var(--chip-bg)] p-5">
              <p className="m-0 text-xl font-semibold text-[var(--sea-ink)]">{displayName}</p>
              <p className="m-0 mt-1 text-sm text-[var(--sea-ink-soft)]">{displayEmail}</p>

              <div className="mt-4 flex flex-wrap gap-2">
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

            <section className="rounded-2xl border border-[var(--line)] bg-[var(--chip-bg)] p-5">
              <p className="island-kicker mb-2">Editor theme presets</p>
              <ThemePresetPicker />
            </section>
          </div>
        </section>
      </main>
    </ProtectedRoute>
  )
}
