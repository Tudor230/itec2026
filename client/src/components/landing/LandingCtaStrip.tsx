import { Link } from '@tanstack/react-router'

export default function LandingCtaStrip() {
  return (
    <section className="mt-8 rounded-2xl border border-[var(--line)] bg-[linear-gradient(165deg,var(--surface-strong),var(--surface))] p-6 shadow-[inset_0_1px_0_var(--inset-glint),0_22px_44px_rgba(30,90,72,0.1),0_6px_18px_rgba(23,58,64,0.08)] backdrop-blur-[4px]">
      <p className="mb-2 text-[0.69rem] font-bold uppercase tracking-[0.16em] text-[var(--kicker)]">
        Flow Focus
      </p>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h2 className="m-0 text-2xl font-semibold text-[var(--sea-ink)]">
            Projects first, then editor.
          </h2>
          <p className="mb-0 mt-2 text-sm leading-7 text-[var(--sea-ink-soft)]">
            The navigation and authentication flow is tuned so users always land
            in Projects, choose the right context, and enter Workspace with less
            friction.
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
