import { Link } from '@tanstack/react-router'

export default function LandingCtaStrip() {
  return (
    <section className="island-shell mt-8 rounded-2xl p-6">
      <p className="island-kicker mb-2">Flow Focus</p>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h2 className="m-0 text-2xl font-semibold text-[var(--sea-ink)]">
            Projects first, then editor.
          </h2>
          <p className="mb-0 mt-2 text-sm leading-7 text-[var(--sea-ink-soft)]">
            The navigation and authentication flow is tuned so users always land in Projects,
            choose the right context, and enter Workspace with less friction.
          </p>
        </div>

        <Link
          to="/projects"
          className="rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-4 py-2 text-sm font-semibold text-[var(--sea-ink)] no-underline transition hover:-translate-y-0.5"
        >
          Open projects
        </Link>
      </div>
    </section>
  )
}
