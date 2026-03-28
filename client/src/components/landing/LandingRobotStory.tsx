import { Link } from '@tanstack/react-router'
import { ArrowDown, LogIn, Sparkles, UserPlus } from 'lucide-react'
import { useAuth0 } from '@auth0/auth0-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { useAuthRuntime } from '../../auth/AuthProvider'
import { InteractiveRobot } from '../ui/robot/InteractiveRobot'
import { clamp01, deriveLandingTimeline } from './landingTimeline'

type SectionKey = 'hero' | 'split' | 'auth'
type LandingActionVariant = 'guest' | 'loading' | 'authenticated'

interface LandingActionState {
  isConfigured: boolean
  isLoading: boolean
  isAuthenticated: boolean
}

const INTRO_SCROLL_SCALE = 0.00135
const MAX_DELTA = 180
const KEYBOARD_DELTA = 96

function clampDelta(value: number) {
  return Math.max(-MAX_DELTA, Math.min(MAX_DELTA, value))
}

function normalizeWheelDelta(event: WheelEvent) {
  if (event.deltaMode === 1) {
    return event.deltaY * 16
  }

  if (event.deltaMode === 2) {
    return event.deltaY * window.innerHeight
  }

  return event.deltaY
}

export function resolveLandingActionVariant(state: LandingActionState): LandingActionVariant {
  if (!state.isConfigured) {
    return 'guest'
  }

  if (state.isLoading) {
    return 'loading'
  }

  if (state.isAuthenticated) {
    return 'authenticated'
  }

  return 'guest'
}

function resolveSection(progress: number): SectionKey {
  if (progress < 0.3) {
    return 'hero'
  }

  if (progress < 0.9) {
    return 'split'
  }

  return 'auth'
}

function GuestActions({ isInteractive }: { isInteractive: boolean }) {
  return (
    <div className="mt-5 flex flex-wrap gap-2">
      <Link
        to="/auth"
        search={{ mode: 'register' }}
        tabIndex={isInteractive ? 0 : -1}
        className="inline-flex items-center gap-2 rounded-full border border-[rgba(50,143,151,0.35)] bg-[rgba(79,184,178,0.15)] px-4 py-2 text-sm font-semibold text-[var(--lagoon-deep)] no-underline"
      >
        <UserPlus size={16} aria-hidden="true" />
        Sign up
      </Link>
      <Link
        to="/auth"
        search={{ mode: 'login' }}
        tabIndex={isInteractive ? 0 : -1}
        className="inline-flex items-center gap-2 rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-4 py-2 text-sm font-semibold text-[var(--sea-ink)] no-underline"
      >
        <LogIn size={16} aria-hidden="true" />
        Log in
      </Link>
    </div>
  )
}

function AuthenticatedActions({ isInteractive }: { isInteractive: boolean }) {
  const { isAuthenticated, isLoading } = useAuth0()
  const variant = resolveLandingActionVariant({
    isConfigured: true,
    isLoading,
    isAuthenticated,
  })

  if (variant === 'loading') {
    return (
      <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-4 py-2 text-sm font-semibold text-[var(--sea-ink-soft)]">
        Checking your session...
      </div>
    )
  }

  if (variant === 'authenticated') {
    return (
      <div className="mt-5 flex flex-wrap gap-2">
        <Link
          to="/projects"
          tabIndex={isInteractive ? 0 : -1}
          className="inline-flex items-center gap-2 rounded-full border border-[rgba(50,143,151,0.35)] bg-[rgba(79,184,178,0.15)] px-4 py-2 text-sm font-semibold text-[var(--lagoon-deep)] no-underline"
        >
          Open projects
        </Link>
        <Link
          to="/workspace"
          search={{ projectId: undefined }}
          tabIndex={isInteractive ? 0 : -1}
          className="inline-flex items-center gap-2 rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-4 py-2 text-sm font-semibold text-[var(--sea-ink)] no-underline"
        >
          Go to workspace
        </Link>
      </div>
    )
  }

  return <GuestActions isInteractive={isInteractive} />
}

function LandingPrimaryActions({ isInteractive }: { isInteractive: boolean }) {
  const { isConfigured } = useAuthRuntime()

  if (!isConfigured) {
    return <GuestActions isInteractive={isInteractive} />
  }

  return <AuthenticatedActions isInteractive={isInteractive} />
}

export default function LandingRobotStory() {
  const scrollRafRef = useRef<number | null>(null)
  const touchYRef = useRef<number | null>(null)
  const progressRef = useRef(0)
  const queuedDeltaRef = useRef(0)
  const isLockedRef = useRef(true)

  const [activeSection, setActiveSection] = useState<SectionKey>('hero')
  const [progress, setProgress] = useState(0)
  const [isReducedMotion, setIsReducedMotion] = useState(false)
  const [isIntroLocked, setIsIntroLocked] = useState(true)

  const applyProgress = (nextProgress: number) => {
    const clamped = clamp01(nextProgress)
    progressRef.current = clamped
    setProgress(clamped)
    setActiveSection(resolveSection(clamped))

    if (clamped >= 1 && isLockedRef.current) {
      isLockedRef.current = false
      setIsIntroLocked(false)
    }
  }

  const unlockIntro = () => {
    applyProgress(1)
    isLockedRef.current = false
    setIsIntroLocked(false)
  }

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')

    const handleChange = () => {
      setIsReducedMotion(media.matches)

      if (media.matches) {
        unlockIntro()
      }
    }

    handleChange()
    media.addEventListener('change', handleChange)

    return () => {
      media.removeEventListener('change', handleChange)
    }
  }, [])

  useEffect(() => {
    isLockedRef.current = isIntroLocked
  }, [isIntroLocked])

  useEffect(() => {
    if (isReducedMotion || !isIntroLocked) {
      return
    }

    const html = document.documentElement
    const body = document.body
    const previousHtmlOverflow = html.style.overflowY
    const previousBodyOverflow = body.style.overflowY
    html.style.overflowY = 'hidden'
    body.style.overflowY = 'hidden'

    const flushQueuedDelta = () => {
      scrollRafRef.current = null

      if (!isLockedRef.current) {
        queuedDeltaRef.current = 0
        return
      }

      const queuedDelta = queuedDeltaRef.current
      queuedDeltaRef.current = 0
      applyProgress(progressRef.current + queuedDelta * INTRO_SCROLL_SCALE)
    }

    const queueDelta = (rawDelta: number) => {
      if (!isLockedRef.current) {
        return
      }

      queuedDeltaRef.current += clampDelta(rawDelta)

      if (scrollRafRef.current !== null) {
        return
      }

      scrollRafRef.current = window.requestAnimationFrame(flushQueuedDelta)
    }

    const onWheel = (event: WheelEvent) => {
      if (!isLockedRef.current) {
        return
      }

      event.preventDefault()
      queueDelta(normalizeWheelDelta(event))
    }

    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0]

      if (!touch) {
        return
      }

      touchYRef.current = touch.clientY
    }

    const onTouchMove = (event: TouchEvent) => {
      if (!isLockedRef.current) {
        return
      }

      const touch = event.touches[0]

      if (!touch) {
        return
      }

      event.preventDefault()

      const previousY = touchYRef.current ?? touch.clientY
      const delta = previousY - touch.clientY
      touchYRef.current = touch.clientY
      queueDelta(delta)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isLockedRef.current) {
        return
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        unlockIntro()
        return
      }

      if (event.key === 'ArrowDown' || event.key === 'PageDown' || event.key === ' ') {
        event.preventDefault()
        queueDelta(KEYBOARD_DELTA)
        return
      }

      if (event.key === 'ArrowUp' || event.key === 'PageUp') {
        event.preventDefault()
        queueDelta(-KEYBOARD_DELTA)
      }
    }

    window.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('keydown', onKeyDown)

    return () => {
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('keydown', onKeyDown)
      html.style.overflowY = previousHtmlOverflow
      body.style.overflowY = previousBodyOverflow

      if (scrollRafRef.current !== null) {
        window.cancelAnimationFrame(scrollRafRef.current)
        scrollRafRef.current = null
      }
    }
  }, [isReducedMotion, isIntroLocked])

  const timeline = useMemo(() => deriveLandingTimeline(progress), [progress])
  const isHeroInteractive = timeline.heroOpacity > 0.24
  const isPhilosophyInteractive = timeline.philosophyOpacity > 0.24
  const isScopeInteractive = timeline.scopeOpacity > 0.24

  return (
    <main
      className="relative h-[calc(100dvh_-_var(--landing-header-offset,0px))]"
      aria-label="Interactive robot landing"
      style={{ scrollBehavior: 'auto' }}
    >
      <div className="relative h-full">
        {isIntroLocked ? (
          <button
            type="button"
            className="absolute right-4 top-4 z-20 rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-3 py-1 text-xs font-semibold text-[var(--sea-ink)]"
            onClick={unlockIntro}
          >
            Skip intro
          </button>
        ) : null}

        <div
          className="pointer-events-none absolute inset-0 z-0 mx-auto h-full [width:min(1000px,88vw)]"
          aria-hidden="true"
          style={{
            transform: `translate3d(${timeline.robotX}%, 0, 0)`,
            opacity: timeline.robotOpacity,
            transition: isReducedMotion ? 'none' : 'transform 70ms linear, opacity 120ms linear',
          }}
        >
          <InteractiveRobot className="h-full w-full" section={activeSection} zoom={timeline.robotZoom} progress={progress} />
        </div>

        <section
          className="absolute inset-0 z-10"
          aria-labelledby="landing-title"
          style={{
            opacity: timeline.heroOpacity,
            transition: isReducedMotion ? 'none' : 'opacity 80ms linear',
            pointerEvents: isHeroInteractive ? 'auto' : 'none',
          }}
          aria-hidden={timeline.heroOpacity <= 0.05}
          inert={!isHeroInteractive}
        >
          <div
            className="mx-auto flex h-full w-[min(1080px,calc(100%_-_2rem))] items-center justify-center"
            style={{
              transform: `translateY(${timeline.heroLift}px)`,
              transition: isReducedMotion ? 'none' : 'transform 80ms linear',
            }}
          >
            <article className={`${isReducedMotion ? '' : 'animate-[rise-in_700ms_cubic-bezier(0.16,1,0.3,1)_both] '}w-[min(700px,100%)] rounded-[1.2rem] border border-[color-mix(in_oklab,var(--line)_74%,var(--lagoon)_26%)] bg-[linear-gradient(165deg,color-mix(in_oklab,var(--surface-strong)_96%,white_4%),var(--surface))] p-5 text-center shadow-[inset_0_1px_0_var(--inset-glint),0_22px_42px_rgba(8,22,27,0.24)] backdrop-blur-[6px]`.trim()}>
              <p className="inline-flex items-center gap-1.5 rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-3 py-1 text-[0.67rem] font-bold uppercase tracking-[0.12em] text-[var(--kicker)]">
                <Sparkles size={14} aria-hidden="true" />
                Whobee takes the lead
              </p>
              <h1 id="landing-title" className="m-0 mt-3 font-[Fraunces,Georgia,serif] text-[clamp(2rem,5vw,3.7rem)] leading-[1.02] text-[var(--sea-ink)]">
                Meet Whobee, the mascot guiding your team from idea to shipping.
              </h1>
              <p className="m-0 mt-3 text-sm leading-7 text-[var(--sea-ink-soft)] sm:text-base">
                Scroll through a continuous story where Whobee keeps planning, coding, and teamwork in one playful flow.
              </p>
              <p className="m-0 mt-4 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.09em] text-[var(--kicker)]">
                <ArrowDown size={16} aria-hidden="true" />
                Keep scrolling to explore the journey
              </p>
            </article>
          </div>
        </section>

        <section
          className="absolute inset-0 z-10"
          aria-labelledby="landing-philosophy-title"
          style={{
            opacity: timeline.philosophyOpacity,
            transition: isReducedMotion ? 'none' : 'opacity 90ms linear',
            pointerEvents: isPhilosophyInteractive ? 'auto' : 'none',
          }}
          aria-hidden={timeline.philosophyOpacity <= 0.05}
          inert={!isPhilosophyInteractive}
        >
          <div
            className="mx-auto flex h-full w-[min(1080px,calc(100%_-_2rem))] items-center justify-start"
            style={{
              transform: `translate3d(${timeline.philosophyX}px, ${timeline.philosophyLift}px, 0)`,
              transition: isReducedMotion ? 'none' : 'transform 90ms linear',
            }}
          >
            <article className="max-w-[540px] rounded-[1.2rem] border border-[color-mix(in_oklab,var(--line)_74%,var(--lagoon)_26%)] bg-[linear-gradient(165deg,color-mix(in_oklab,var(--surface-strong)_96%,white_4%),var(--surface))] p-5 shadow-[inset_0_1px_0_var(--inset-glint),0_22px_42px_rgba(8,22,27,0.24)] backdrop-blur-[6px]" id="features">
              <p className={`inline-flex items-center gap-1.5 rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-3 py-1 text-[0.67rem] font-bold uppercase tracking-[0.12em] text-[var(--kicker)] ${!isReducedMotion && timeline.philosophyOpacity > 0.05 ? 'animate-[rise-in_700ms_cubic-bezier(0.16,1,0.3,1)_both]' : ''}`.trim()}>Philosophy</p>
              <h2 id="landing-philosophy-title" className="m-0 mt-3 font-[Fraunces,Georgia,serif] text-[clamp(1.7rem,3.8vw,2.65rem)] leading-[1.08] text-[var(--sea-ink)]">
                Whobee keeps the whole team in the same story.
              </h2>
              <div className="mt-4 grid gap-3">
                <div className="rounded-xl border border-[var(--line)] bg-[rgba(var(--chip-bg-rgb),0.34)] p-3">
                  <h3 className="m-0">Understand quickly</h3>
                  <p className="m-0 mt-1 text-sm leading-6 text-[var(--sea-ink-soft)]">
                    Every section explains what the product is doing now, without forcing visitors to decode technical jargon first.
                  </p>
                </div>
                <div className="rounded-xl border border-[var(--line)] bg-[rgba(var(--chip-bg-rgb),0.34)] p-3">
                  <h3 className="m-0">Stay playful, stay useful</h3>
                  <p className="m-0 mt-1 text-sm leading-6 text-[var(--sea-ink-soft)]">
                    Whobee keeps momentum high while still grounding the story in real collaboration and delivery outcomes.
                  </p>
                </div>
                <div className="rounded-xl border border-[var(--line)] bg-[rgba(var(--chip-bg-rgb),0.34)] p-3">
                  <h3 className="m-0">Move from curious to ready</h3>
                  <p className="m-0 mt-1 text-sm leading-6 text-[var(--sea-ink-soft)]">
                    The narrative starts with clarity, then naturally shifts into conversion when visitors know what they are signing up for.
                  </p>
                </div>
              </div>
            </article>
          </div>
        </section>

        <section
          className="absolute inset-0 z-10"
          aria-labelledby="landing-scope-title"
          style={{
            opacity: timeline.scopeOpacity,
            transition: isReducedMotion ? 'none' : 'opacity 120ms linear',
            pointerEvents: isScopeInteractive ? 'auto' : 'none',
          }}
          aria-hidden={timeline.scopeOpacity <= 0.05}
          inert={!isScopeInteractive}
        >
          <div
            className="mx-auto flex h-full w-[min(1080px,calc(100%_-_2rem))] items-center justify-end"
            style={{
              transform: `translate3d(${timeline.scopeX}px, ${timeline.scopeLift}px, 0)`,
              transition: isReducedMotion ? 'none' : 'transform 120ms linear',
            }}
          >
            <article className="w-[min(640px,100%)] rounded-[1.2rem] border border-[color-mix(in_oklab,var(--line)_74%,var(--lagoon)_26%)] bg-[linear-gradient(165deg,color-mix(in_oklab,var(--surface-strong)_96%,white_4%),var(--surface))] p-5 shadow-[inset_0_1px_0_var(--inset-glint),0_22px_42px_rgba(8,22,27,0.24)] backdrop-blur-[6px]">
              <p className="inline-flex items-center gap-1.5 rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-3 py-1 text-[0.67rem] font-bold uppercase tracking-[0.12em] text-[var(--kicker)]">Scope and direction</p>
              <h2 id="landing-scope-title" className="m-0 mt-3 font-[Fraunces,Georgia,serif] text-[clamp(1.6rem,3.8vw,2.55rem)] leading-[1.08] text-[var(--sea-ink)]">
                Built for mixed teams today, stretching toward a bigger collaborative future.
              </h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-[var(--line)] bg-[rgba(var(--chip-bg-rgb),0.34)] p-3">
                  <p className="m-0 text-[0.64rem] font-bold uppercase tracking-[0.12em] text-[var(--kicker)]">What works now</p>
                  <ul className="m-0 mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-[var(--sea-ink-soft)]">
                    <li>Projects hub and direct editor entry.</li>
                    <li>Auth0 hosted authentication with safe return flow.</li>
                    <li>Shared workspace foundation for coding collaboration.</li>
                  </ul>
                </div>
                <div className="rounded-xl border border-[var(--line)] bg-[rgba(var(--chip-bg-rgb),0.34)] p-3">
                  <p className="m-0 text-[0.64rem] font-bold uppercase tracking-[0.12em] text-[var(--kicker)]">What is next</p>
                  <ul className="m-0 mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-[var(--sea-ink-soft)]">
                    <li>Richer AI-assisted build loops in context.</li>
                    <li>Deeper real-time collaboration moments.</li>
                    <li>More guided execution and feedback flows.</li>
                  </ul>
                </div>
              </div>

              <p className="m-0 mt-5 text-sm leading-7 text-[var(--sea-ink-soft)] sm:text-base">
                Continue where your team works best. New visitors can sign up in seconds, and returning builders can jump straight into projects.
              </p>
              <LandingPrimaryActions isInteractive={isScopeInteractive} />
            </article>
          </div>
        </section>
      </div>
    </main>
  )
}
