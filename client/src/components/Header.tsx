import { Link } from '@tanstack/react-router'
import ProfileButton from './profile/ProfileButton'

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[var(--header-bg)] px-4 backdrop-blur-lg">
      <nav className="page-wrap header-nav-layout py-3 sm:py-4">
        <h2 className="m-0 flex-shrink-0 text-base font-semibold tracking-tight header-brand-slot">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-3 py-1.5 text-sm text-[var(--sea-ink)] no-underline shadow-[0_8px_24px_rgba(30,90,72,0.08)] sm:px-4 sm:py-2"
          >
            <span className="h-2 w-2 rounded-full bg-[linear-gradient(90deg,#56c6be,#7ed3bf)]" />
            iTECify
          </Link>
        </h2>

        <div className="header-center-links flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pb-1 text-sm font-semibold sm:w-auto sm:flex-nowrap sm:pb-0">
          <Link
            to="/"
            className="nav-link"
            activeProps={{ className: 'nav-link is-active' }}
          >
            Home
          </Link>
          <Link
            to="/about"
            className="nav-link"
            activeProps={{ className: 'nav-link is-active' }}
          >
            About
          </Link>
          <Link
            to="/workspace"
            className="nav-link"
            activeProps={{ className: 'nav-link is-active' }}
          >
            Workspace
          </Link>
          <Link
            to="/projects"
            className="nav-link"
            activeProps={{ className: 'nav-link is-active' }}
          >
            Projects
          </Link>
        </div>

        <div className="header-profile-slot flex justify-end">
          <ProfileButton />
        </div>
      </nav>
    </header>
  )
}
