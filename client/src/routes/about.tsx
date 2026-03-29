import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/about')({
  component: About,
})

function About() {
  return (
    <main className="mx-auto w-full max-w-[1080px] px-4 py-12">
      <section className="rounded-2xl border border-[var(--line)] bg-[linear-gradient(165deg,var(--surface-strong),var(--surface))] p-6 shadow-[inset_0_1px_0_var(--inset-glint),0_22px_44px_rgba(30,90,72,0.1),0_6px_18px_rgba(23,58,64,0.08)] backdrop-blur-[4px] sm:p-8">
        <p className="mb-2 text-[0.69rem] font-bold uppercase tracking-[0.16em] text-[var(--kicker)]">
          About
        </p>
        <h1 className="mb-3 font-[Fraunces,Georgia,serif] text-4xl font-bold text-[var(--sea-ink)] sm:text-5xl">
          Built to reduce friction between idea and code.
        </h1>
        <div className="max-w-3xl space-y-4 text-base leading-8 text-[var(--sea-ink-soft)]">
          <p className="m-0">
            iTECify brings projects, editor access, and account controls into
            one consistent flow so teams spend less time navigating and more
            time shipping.
          </p>
          <p className="m-0">
            The current milestone centers on a cleaner projects hub, direct
            open-in-editor actions, and a profile-driven command center for
            theme and account operations.
          </p>
          <p className="m-0">
            Authentication is powered by hosted Auth0 and always returns users
            to Projects, where they can choose exactly what to open next.
          </p>
        </div>
      </section>
    </main>
  )
}
