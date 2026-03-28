import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

export default function LandingDeferredAuthCta() {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const onScroll = () => {
      const viewportHeight = window.innerHeight
      const scrollY = window.scrollY
      const threshold = Math.max(320, viewportHeight * 0.45)

      setIsVisible(scrollY >= threshold)
    }

    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', onScroll)
    }
  }, [])

  return (
    <section
      id="landing-auth-cta"
      className={`landing-auth-cta island-shell mt-10 rounded-2xl p-6 ${
        isVisible ? 'is-visible' : ''
      }`}
    >
      <p className="island-kicker mb-2">Ready to enter iTECify?</p>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h2 className="m-0 text-2xl font-semibold text-[var(--sea-ink)]">
            Sign in to open your projects and launch the editor in one click.
          </h2>
          <p className="mb-0 mt-2 text-sm leading-7 text-[var(--sea-ink-soft)]">
            Authentication now lands you in Projects, where you can pick exactly what to open next.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            to="/auth"
            search={{ mode: 'login' }}
            className="rounded-full border border-[rgba(50,143,151,0.35)] bg-[rgba(79,184,178,0.15)] px-4 py-2 text-sm font-semibold text-[var(--lagoon-deep)] no-underline"
          >
            Log in
          </Link>
          <Link
            to="/auth"
            search={{ mode: 'register' }}
            className="rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-4 py-2 text-sm font-semibold text-[var(--sea-ink)] no-underline"
          >
            Create account
          </Link>
        </div>
      </div>
    </section>
  )
}
