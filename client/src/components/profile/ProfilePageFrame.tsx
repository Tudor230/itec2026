import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

interface ProfilePageFrameProps {
  title: string
  description: string
  children: ReactNode
}

const tabClass =
  'rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--sea-ink-soft)] no-underline'

const activeTabClass =
  'rounded-full border border-[color-mix(in_oklab,var(--lagoon-deep)_32%,var(--chip-line))] bg-[rgba(var(--lagoon-rgb),0.14)] px-3 py-1.5 text-xs font-semibold text-[var(--sea-ink)] no-underline'

export default function ProfilePageFrame({ title, description, children }: ProfilePageFrameProps) {
  return (
    <main className="mx-auto w-full max-w-[1080px] px-4 py-10 sm:py-12">
      <section className="rounded-[1.8rem] border border-[var(--line)] bg-[linear-gradient(165deg,var(--surface-strong),var(--surface))] p-6 shadow-[inset_0_1px_0_var(--inset-glint),0_22px_44px_rgba(30,90,72,0.1),0_6px_18px_rgba(23,58,64,0.08)] backdrop-blur-[4px] sm:p-8">
        <p className="mb-2 text-[0.69rem] font-bold uppercase tracking-[0.16em] text-[var(--kicker)]">Profile</p>
        <h1 className="mb-2 font-[Fraunces,Georgia,serif] text-4xl font-bold text-[var(--sea-ink)] sm:text-5xl">
          {title}
        </h1>
        <p className="m-0 max-w-2xl text-sm text-[var(--sea-ink-soft)]">{description}</p>

        <nav className="mt-5 flex flex-wrap items-center gap-2">
          <Link to="/profile/account" className={tabClass} activeProps={{ className: activeTabClass }}>
            Account Info
          </Link>
          <Link to="/profile/settings" className={tabClass} activeProps={{ className: activeTabClass }}>
            Settings
          </Link>
          <Link to="/profile/theme" className={tabClass} activeProps={{ className: activeTabClass }}>
            Theme
          </Link>
        </nav>

        <div className="mt-6 grid gap-6">{children}</div>
      </section>
    </main>
  )
}
