import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/about')({
  component: About,
})

function About() {
  return (
    <main className="page-wrap px-4 py-12">
      <section className="island-shell rounded-2xl p-6 sm:p-8">
        <p className="island-kicker mb-2">About</p>
        <h1 className="display-title mb-3 text-4xl font-bold text-[var(--sea-ink)] sm:text-5xl">
          Why this Auth0 setup stays simple.
        </h1>
        <div className="max-w-3xl space-y-4 text-base leading-8 text-[var(--sea-ink-soft)]">
          <p className="m-0">
            This app keeps authentication inside the TanStack Start frontend by
            using the official Auth0 React SDK. That matches the requirement to
            avoid a separate backend service unless one becomes strictly
            necessary.
          </p>
          <p className="m-0">
            The route structure follows the current TanStack Start Vite plugin
            starter that is already present in this repository: file-based
            routes in <code>src/routes</code>, a root shell in <code>src/routes/__root.tsx</code>,
            and shared providers mounted once at the app root.
          </p>
          <p className="m-0">
            For Auth0 SDK v2 and newer, login and logout options are passed via{' '}
            <code>authorizationParams</code> and <code>logoutParams</code>. This setup uses that current API.
          </p>
        </div>
      </section>
    </main>
  )
}
