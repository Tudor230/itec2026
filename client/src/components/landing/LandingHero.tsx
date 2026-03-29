import { Compass, ShieldCheck } from 'lucide-react'

export default function LandingHero() {
  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-[var(--line)] bg-[linear-gradient(165deg,var(--surface-strong),var(--surface))] px-6 py-12 shadow-[inset_0_1px_0_var(--inset-glint),0_22px_44px_rgba(30,90,72,0.1),0_6px_18px_rgba(23,58,64,0.08)] backdrop-blur-[4px] animate-in fade-in slide-in-from-bottom-3 duration-700 sm:px-10 sm:py-16">
      <div className="pointer-events-none absolute left-[-4.5rem] top-[-5.5rem] h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(79,184,178,0.4),transparent_66%)] blur-[2px]" />
      <div className="pointer-events-none absolute bottom-[-4.5rem] right-[-4rem] h-60 w-60 rounded-full bg-[radial-gradient(circle,rgba(47,106,74,0.24),transparent_66%)] blur-[2px]" />
      <div className="relative z-10 grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div>
          <p className="mb-3 text-[0.69rem] font-bold uppercase tracking-[0.16em] text-[var(--kicker)]">
            iTECify Collaborative IDE
          </p>
          <h1 className="mb-5 max-w-4xl font-[Fraunces,Georgia,serif] text-4xl font-bold leading-[1.02] tracking-tight text-[var(--sea-ink)] sm:text-6xl">
            One shared coding surface for your whole team.
          </h1>
          <p className="mb-8 max-w-2xl text-base text-[var(--sea-ink-soft)] sm:text-lg">
            Open a workspace, co-edit in real time, keep experiments in separate
            timelines, and move quickly from idea to runnable code.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <a
              href="#landing-auth-cta"
              className="inline-flex items-center gap-2 rounded-full border border-[rgba(50,143,151,0.34)] bg-[rgba(79,184,178,0.15)] px-5 py-2.5 text-sm font-semibold text-[var(--lagoon-deep)] no-underline transition hover:-translate-y-0.5 hover:bg-[rgba(79,184,178,0.26)]"
            >
              Explore before signing in
              <Compass size={15} />
            </a>

            <a
              href="#features"
              className="rounded-full border border-[rgba(23,58,64,0.2)] bg-white/60 px-5 py-2.5 text-sm font-semibold text-[var(--sea-ink)] no-underline transition hover:-translate-y-0.5 hover:border-[rgba(23,58,64,0.35)]"
            >
              See collaboration features
            </a>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[var(--sea-ink-soft)]">
            <span className="inline-flex items-center gap-1">
              <ShieldCheck size={13} />
              Hosted login with secure redirects
            </span>
            <span>Desktop-first workspace model</span>
            <span>Monaco-based editor core</span>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-[color-mix(in_oklab,var(--line)_85%,var(--lagoon)_15%)] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--surface-strong)_94%,white_6%),color-mix(in_oklab,var(--surface)_94%,white_6%))] shadow-[inset_0_1px_0_var(--inset-glint),0_16px_30px_rgba(23,58,64,0.08)]">
          <div className="flex items-center gap-[0.3rem] border-b border-[var(--line)] bg-[color-mix(in_oklab,var(--chip-bg)_88%,white_12%)] px-[0.8rem] py-[0.6rem]">
            <span className="h-[0.52rem] w-[0.52rem] rounded-full bg-[rgba(255,92,92,0.9)]" />
            <span className="h-[0.52rem] w-[0.52rem] rounded-full bg-[rgba(255,192,84,0.9)]" />
            <span className="h-[0.52rem] w-[0.52rem] rounded-full bg-[rgba(66,212,131,0.9)]" />
            <span className="ml-3 text-xs text-[var(--sea-ink-soft)]">
              workspace/session-42
            </span>
          </div>
          <div className="min-h-[230px] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--surface-strong)_88%,white_12%),color-mix(in_oklab,var(--surface)_88%,white_12%))] px-[0.9rem] pb-[1rem] pt-[0.9rem] font-mono text-xs leading-6 text-[var(--sea-ink)] sm:text-sm">
            <p className="m-0">$ itecify join --project atlas-ui</p>
            <p className="m-0 text-[var(--sea-ink-soft)]">
              Connecting collaborators...
            </p>
            <p className="m-0 text-[var(--sea-ink-soft)]">
              Presence sync established (3 online)
            </p>
            <p className="m-0">
              $ git timeline create feature/auth-lock-overlay
            </p>
            <p className="m-0 text-[var(--sea-ink-soft)]">
              Timeline created at 13:42:18
            </p>
            <p className="m-0">$ run workspace</p>
            <p className="m-0 text-[var(--sea-ink-soft)]">
              Run panel connected. Waiting for execution.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
