import { Compass, ShieldCheck } from 'lucide-react'

export default function LandingHero() {
  return (
    <section className="landing-hero island-shell rise-in relative overflow-hidden rounded-[2rem] px-6 py-12 sm:px-10 sm:py-16">
      <div className="landing-glow landing-glow-a" />
      <div className="landing-glow landing-glow-b" />
      <div className="landing-grid relative z-10">
        <div>
          <p className="island-kicker mb-3">iTECify Collaborative IDE</p>
          <h1 className="display-title mb-5 max-w-4xl text-4xl leading-[1.02] font-bold tracking-tight text-[var(--sea-ink)] sm:text-6xl">
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

        <div className="landing-terminal-shell">
          <div className="landing-terminal-head">
            <span className="landing-dot bg-[rgba(255,92,92,0.9)]" />
            <span className="landing-dot bg-[rgba(255,192,84,0.9)]" />
            <span className="landing-dot bg-[rgba(66,212,131,0.9)]" />
            <span className="ml-3 text-xs text-[var(--sea-ink-soft)]">
              workspace/session-42
            </span>
          </div>
          <div className="landing-terminal-body font-mono text-xs leading-6 text-[var(--sea-ink)] sm:text-sm">
            <p className="m-0">$ itecify join --project atlas-ui</p>
            <p className="m-0 text-[var(--sea-ink-soft)]">Connecting collaborators...</p>
            <p className="m-0 text-[var(--sea-ink-soft)]">Presence sync established (3 online)</p>
            <p className="m-0">$ git timeline create feature/auth-lock-overlay</p>
            <p className="m-0 text-[var(--sea-ink-soft)]">Timeline created at 13:42:18</p>
            <p className="m-0">$ run workspace</p>
            <p className="m-0 text-[var(--sea-ink-soft)]">Run panel connected. Waiting for execution.</p>
          </div>
        </div>
      </div>
    </section>
  )
}
