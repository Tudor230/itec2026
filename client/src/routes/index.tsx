import { Link, createFileRoute } from '@tanstack/react-router'
import AuthSetupNotice from '../components/auth/AuthSetupNotice'
import LoginButton from '../components/auth/LoginButton'
import LogoutButton from '../components/auth/LogoutButton'
import UserInfo from '../components/auth/UserInfo'

export const Route = createFileRoute('/')({ component: App })

function App() {
  return (
    <main className="page-wrap px-4 pb-8 pt-14">
      <section className="island-shell rise-in relative overflow-hidden rounded-[2rem] px-6 py-10 sm:px-10 sm:py-14">
        <div className="pointer-events-none absolute -left-20 -top-24 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(79,184,178,0.32),transparent_66%)]" />
        <div className="pointer-events-none absolute -bottom-20 -right-20 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(47,106,74,0.18),transparent_66%)]" />
        <p className="island-kicker mb-3">TanStack Start + Auth0</p>
        <h1 className="display-title mb-5 max-w-3xl text-4xl leading-[1.02] font-bold tracking-tight text-[var(--sea-ink)] sm:text-6xl">
          Single-app authentication with a protected dashboard.
        </h1>
        <p className="mb-8 max-w-2xl text-base text-[var(--sea-ink-soft)] sm:text-lg">
          This setup uses the official Auth0 React SDK inside one TanStack Start
          codebase, keeps configuration in environment variables, and preserves
          the route users were trying to reach before login.
        </p>
        <div className="flex flex-wrap gap-3">
          <LoginButton
            label="Log in with Auth0"
            className="rounded-full border border-[rgba(50,143,151,0.3)] bg-[rgba(79,184,178,0.14)] px-5 py-2.5 text-sm font-semibold text-[var(--lagoon-deep)] no-underline transition hover:-translate-y-0.5 hover:bg-[rgba(79,184,178,0.24)] disabled:cursor-not-allowed disabled:opacity-60"
          />
          <LogoutButton
            className="rounded-full border border-[rgba(23,58,64,0.2)] bg-white/50 px-5 py-2.5 text-sm font-semibold text-[var(--sea-ink)] no-underline transition hover:-translate-y-0.5 hover:border-[rgba(23,58,64,0.35)]"
          />
          <Link
            to="/dashboard"
            className="rounded-full border border-[rgba(23,58,64,0.2)] bg-white/50 px-5 py-2.5 text-sm font-semibold text-[var(--sea-ink)] no-underline transition hover:-translate-y-0.5 hover:border-[rgba(23,58,64,0.35)]"
          >
            Go to dashboard
          </Link>
        </div>
      </section>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          [
            'Official Auth0 SDK',
            'Authentication uses @auth0/auth0-react without adding a separate backend service.',
          ],
          [
            'Protected Routes',
            'The dashboard route redirects unauthenticated users to Auth0 and returns them afterward.',
          ],
          [
            'Environment Driven',
            'Auth0 domain, client ID, callback URL, and logout URL live in .env.',
          ],
          [
            'Reusable Auth UI',
            'Login, logout, and authenticated user display live in focused, reusable components.',
          ],
        ].map(([title, desc], index) => (
          <article
            key={title}
            className="island-shell feature-card rise-in rounded-2xl p-5"
            style={{ animationDelay: `${index * 90 + 80}ms` }}
          >
            <h2 className="mb-2 text-base font-semibold text-[var(--sea-ink)]">
              {title}
            </h2>
            <p className="m-0 text-sm text-[var(--sea-ink-soft)]">{desc}</p>
          </article>
        ))}
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <UserInfo />
        <AuthSetupNotice />
      </div>

      <section className="island-shell mt-8 rounded-2xl p-6">
        <p className="island-kicker mb-2">Quick Start</p>
        <ul className="m-0 list-disc space-y-2 pl-5 text-sm text-[var(--sea-ink-soft)]">
          <li>Set your Auth0 values in <code>.env</code>.</li>
          <li>Use <code>npm install</code> and <code>npm run dev</code>.</li>
          <li>Try the protected <code>/dashboard</code> route before and after logging in.</li>
        </ul>
      </section>
    </main>
  )
}
