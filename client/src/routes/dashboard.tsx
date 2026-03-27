import { createFileRoute } from '@tanstack/react-router'
import ProtectedRoute from '../auth/ProtectedRoute'
import LogoutButton from '../components/auth/LogoutButton'
import UserInfo from '../components/auth/UserInfo'

export const Route = createFileRoute('/dashboard')({
  component: Dashboard,
})

function Dashboard() {
  return (
    <ProtectedRoute>
      <main className="page-wrap px-4 py-12">
        <section className="island-shell rounded-[2rem] px-6 py-10 sm:px-10 sm:py-12">
          <p className="island-kicker mb-3">Protected Route</p>
          <h1 className="display-title mb-4 text-4xl font-bold text-[var(--sea-ink)] sm:text-5xl">
            Dashboard
          </h1>
          <p className="mb-8 max-w-3xl text-base leading-8 text-[var(--sea-ink-soft)]">
            If you can see this page, Auth0 confirmed your session and the app
            returned you to the protected route you originally requested.
          </p>
          <div className="flex flex-wrap gap-3">
            <LogoutButton />
          </div>
        </section>

        <div className="mt-8">
          <UserInfo />
        </div>
      </main>
    </ProtectedRoute>
  )
}