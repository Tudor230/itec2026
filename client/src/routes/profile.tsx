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
      <main className="mx-auto w-full max-w-[1080px] px-4 py-10 sm:py-12">
        <section className="rounded-[1.8rem] border border-[var(--line)] bg-[linear-gradient(165deg,var(--surface-strong),var(--surface))] p-6 shadow-[inset_0_1px_0_var(--inset-glint),0_22px_44px_rgba(30,90,72,0.1),0_6px_18px_rgba(23,58,64,0.08)] backdrop-blur-[4px] sm:p-8">
          <p className="mb-2 text-[0.69rem] font-bold uppercase tracking-[0.16em] text-[var(--kicker)]">Profile</p>
          <h1 className="mb-5 font-[Fraunces,Georgia,serif] text-4xl font-bold text-[var(--sea-ink)] sm:text-5xl">
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
              <p className="mb-2 text-[0.69rem] font-bold uppercase tracking-[0.16em] text-[var(--kicker)]">Editor theme presets</p>
              <ThemePresetPicker />
            </section>
          </div>
        </section>
      </main>
    </ProtectedRoute>
  )
}
