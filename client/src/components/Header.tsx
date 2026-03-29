import { Link } from '@tanstack/react-router'
import ProfileButton from './profile/ProfileButton'

const navLinkClass =
  'relative text-[var(--sea-ink-soft)] no-underline transition-colors hover:text-[var(--sea-ink)] after:absolute after:bottom-[-8px] after:left-0 after:h-[2px] after:w-full after:origin-left after:scale-x-0 after:bg-[linear-gradient(90deg,var(--lagoon),#7ed3bf)] after:transition-transform hover:after:scale-x-100'

const navLinkActiveClass = `${navLinkClass} text-[var(--sea-ink)] after:scale-x-100`

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[var(--header-bg)] px-4 backdrop-blur-lg">
      <nav className="mx-auto grid w-full max-w-[1080px] grid-cols-1 items-center gap-3 py-3 sm:py-4 md:grid-cols-[auto_minmax(0,1fr)_auto]">
        <h2 className="m-0 shrink-0 justify-self-center text-base font-semibold tracking-tight md:justify-self-start">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-3 py-1.5 text-sm text-[var(--sea-ink)] no-underline shadow-[0_8px_24px_rgba(30,90,72,0.08)] sm:px-4 sm:py-2"
          >
            <span className="h-2 w-2 rounded-full bg-[linear-gradient(90deg,#56c6be,#7ed3bf)]" />
            iTECify
          </Link>
        </h2>

        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pb-1 text-sm font-semibold sm:w-auto sm:flex-nowrap sm:pb-0 md:justify-self-center">
          <Link
            to="/"
            className={navLinkClass}
            activeProps={{ className: navLinkActiveClass }}
          >
            Home
          </Link>
          <Link
            to="/about"
            className={navLinkClass}
            activeProps={{ className: navLinkActiveClass }}
          >
            About
          </Link>
          <Link
            to="/workspace"
            search={{ projectId: undefined }}
            className={navLinkClass}
            activeProps={{ className: navLinkActiveClass }}
          >
            Workspace
          </Link>
          <Link
            to="/projects"
            className={navLinkClass}
            activeProps={{ className: navLinkActiveClass }}
          >
            Projects
          </Link>
        </div>

        <div className="flex justify-center md:justify-self-end">
          <ProfileButton />
        </div>
      </nav>
    </header>
  )
}
