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
          Built to reduce friction between idea and code.
        </h1>
        <div className="max-w-3xl space-y-4 text-base leading-8 text-[var(--sea-ink-soft)]">
          <p className="m-0">
            iTECify brings projects, editor access, and account controls into one
            consistent flow so teams spend less time navigating and more time shipping.
          </p>
          <p className="m-0">
            The current milestone centers on a cleaner projects hub, direct open-in-editor actions,
            and a profile-driven command center for theme and account operations.
          </p>
          <p className="m-0">
            Authentication is powered by hosted Auth0 and always returns users to Projects,
            where they can choose exactly what to open next.
          </p>
        </div>
      </section>
    </main>
  )
}
