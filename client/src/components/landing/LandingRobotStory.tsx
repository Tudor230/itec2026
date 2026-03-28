import { Link } from '@tanstack/react-router'
import { ArrowDown, LogIn, Sparkles, UserPlus } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { InteractiveRobot } from '../ui/robot/InteractiveRobot'
import { clamp01, deriveLandingTimeline, easeOutCubic, lerp, nearestSnapPoint, segmentProgress } from './landingTimeline'

type SectionKey = 'hero' | 'split' | 'auth'

export default function LandingRobotStory() {
  const shellRef = useRef<HTMLElement | null>(null)
  const snapTimeoutRef = useRef<number | null>(null)
  const snapRafRef = useRef<number | null>(null)
  const isSnappingRef = useRef(false)
  const [activeSection, setActiveSection] = useState<SectionKey>('hero')
  const [progress, setProgress] = useState(0)
  const [robotZoom, setRobotZoom] = useState(1)
  const [isReducedMotion, setIsReducedMotion] = useState(false)

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')

    const handleChange = () => {
      setIsReducedMotion(media.matches)
    }

    handleChange()
    media.addEventListener('change', handleChange)

    return () => {
      media.removeEventListener('change', handleChange)
    }
  }, [])

  useEffect(() => {
    const shell = shellRef.current

    if (!shell) {
      return
    }

    const snapPoints = [0, 0.5, 1] as const
    const snapDurationMs = 300

    const clearSnapAnimation = () => {
      if (snapRafRef.current !== null) {
        window.cancelAnimationFrame(snapRafRef.current)
        snapRafRef.current = null
      }
    }

    const clearSnapTimeout = () => {
      if (snapTimeoutRef.current !== null) {
        window.clearTimeout(snapTimeoutRef.current)
        snapTimeoutRef.current = null
      }
    }

    const getMaxScroll = () => Math.max(shell.scrollHeight - shell.clientHeight, 1)

    const applyFromProgress = (nextProgress: number) => {
      const clamped = clamp01(nextProgress)
      setProgress(clamped)

      if (clamped < 0.2) {
        setActiveSection('hero')
      } else if (clamped < 0.8) {
        setActiveSection('split')
      } else {
        setActiveSection('auth')
      }

      if (clamped < 0.2) {
        setRobotZoom(1)
      } else if (clamped < 0.8) {
        setRobotZoom(0.86)
      } else {
        setRobotZoom(0.76)
      }
    }

    const updateFromScroll = () => {
      applyFromProgress(shell.scrollTop / getMaxScroll())
    }

    const animateSnapTo = (targetProgress: number) => {
      if (isReducedMotion) {
        return
      }

      clearSnapAnimation()
      isSnappingRef.current = true

      const startTop = shell.scrollTop
      const targetTop = clamp01(targetProgress) * getMaxScroll()
      const distance = targetTop - startTop

      if (Math.abs(distance) < 1) {
        return
      }

      const startedAt = performance.now()

      const frame = (now: number) => {
        const elapsed = now - startedAt
        const t = clamp01(elapsed / snapDurationMs)
        const eased = easeOutCubic(t)
        shell.scrollTop = startTop + distance * eased
        updateFromScroll()

        if (t < 1) {
          snapRafRef.current = window.requestAnimationFrame(frame)
        } else {
          snapRafRef.current = null
          isSnappingRef.current = false
        }
      }

      snapRafRef.current = window.requestAnimationFrame(frame)
    }

    const scheduleSnap = () => {
      if (isReducedMotion) {
        return
      }

      clearSnapTimeout()
      snapTimeoutRef.current = window.setTimeout(() => {
        const currentProgress = shell.scrollTop / getMaxScroll()
        const target = nearestSnapPoint(currentProgress, snapPoints)
        animateSnapTo(target)
      }, 110)
    }

    const onScroll = () => {
      if (!isSnappingRef.current) {
        clearSnapAnimation()
      }

      updateFromScroll()

      if (!isSnappingRef.current) {
        scheduleSnap()
      }
    }

    updateFromScroll()
    shell.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      shell.removeEventListener('scroll', onScroll)
      clearSnapTimeout()
      clearSnapAnimation()
      isSnappingRef.current = false
    }
  }, [isReducedMotion])

  const timeline = useMemo(() => deriveLandingTimeline(progress), [progress])

  return (
    <main
      ref={shellRef}
      className="rl-shell"
      aria-label="Interactive robot landing"
      style={{ scrollSnapType: 'none', scrollBehavior: 'auto' }}
    >
      <div className="relative min-h-[300vh]">
        <div className="sticky top-0 h-[calc(100dvh-var(--landing-header-offset))]">
          <div className="relative h-full">
            <div
              className="pointer-events-none absolute inset-0 z-0 mx-auto h-full [width:min(1000px,88vw)]"
              aria-hidden="true"
              style={{
                transform: `translate3d(${timeline.robotX}%, 0, 0)`,
                opacity: timeline.robotOpacity,
                transition: isReducedMotion ? 'none' : 'transform 50ms linear, opacity 140ms linear',
              }}
            >
              <InteractiveRobot className="h-full w-full" section={activeSection} zoom={robotZoom} progress={progress} />
            </div>

            <section
              className="absolute inset-0 z-10 rl-panel rl-panel-hero"
              aria-labelledby="landing-title"
              style={{
                opacity: timeline.heroOpacity,
                transition: isReducedMotion ? 'none' : 'opacity 70ms linear',
                pointerEvents: timeline.heroOpacity > 0.5 ? 'auto' : 'none',
              }}
              aria-hidden={timeline.heroOpacity <= 0.05}
            >
              <div
                className="page-wrap rl-content rl-content-hero"
                style={{
                  transform: `translateY(${lerp(0, -28, segmentProgress(progress, 0.2, 0.4))}px)`,
                  transition: isReducedMotion ? 'none' : 'transform 70ms linear',
                }}
              >
                <div className="rise-in rl-copy">
                  <p className="rl-chip">
                    <Sparkles size={14} aria-hidden="true" />
                    Interactive launch experience
                  </p>
                  <h1 id="landing-title" className="display-title m-0 rl-title">
                    Meet Whobee, your interactive 3D coding companion.
                  </h1>
                  <p className="m-0 rl-lead">
                    Build with a guided 3-section flow. Start with the product story, move through platform value,
                    and finish with direct access to your collaborative workspace.
                  </p>
                  <p className="m-0 rl-scroll-hint">
                    <ArrowDown size={16} aria-hidden="true" />
                    Scroll to continue
                  </p>
                </div>
              </div>
            </section>

            <section
              className="absolute inset-0 z-10 rl-panel rl-panel-split"
              aria-labelledby="landing-value-title"
              style={{
                opacity: timeline.infoOpacity,
                transition: isReducedMotion ? 'none' : 'opacity 70ms linear',
                pointerEvents: timeline.infoOpacity > 0.5 ? 'auto' : 'none',
              }}
              aria-hidden={timeline.infoOpacity <= 0.05}
            >
              <div
                className="page-wrap rl-content rl-content-split"
                style={{
                  transform: `translateY(${lerp(20, 0, segmentProgress(progress, 0.2, 0.4))}px)`,
                  transition: isReducedMotion ? 'none' : 'transform 70ms linear',
                }}
              >
                <article className="rise-in rl-info-block" id="features">
                  <p className={`rl-chip ${timeline.infoOpacity > 0.05 ? 'rise-in' : ''}`.trim()}>Platform value</p>
                  <h2 id="landing-value-title" className="display-title m-0 rl-heading">
                    One workflow from plan to code to shared execution.
                  </h2>
                  <div className="rl-points">
                    <div className="rl-point">
                      <h3 className="m-0">Context stays connected</h3>
                      <p className="m-0">
                        Keep ideas, code, and execution in one place so teams can move forward without losing intent.
                      </p>
                    </div>
                    <div className="rl-point">
                      <h3 className="m-0">Collaboration in real time</h3>
                      <p className="m-0">
                        Share project state instantly and reduce handoff overhead across engineers and stakeholders.
                      </p>
                    </div>
                    <div className="rl-point">
                      <h3 className="m-0">Delivery with confidence</h3>
                      <p className="m-0">
                        Build momentum with a workspace that keeps decisions, changes, and results aligned.
                      </p>
                    </div>
                  </div>
                </article>
              </div>
            </section>

            <section
              className="absolute inset-0 z-10 rl-panel rl-panel-auth"
              aria-labelledby="landing-auth-title"
              style={{
                opacity: timeline.authOpacity,
                transition: isReducedMotion ? 'none' : 'opacity 180ms ease-in',
                pointerEvents: timeline.authOpacity > 0.5 ? 'auto' : 'none',
              }}
              aria-hidden={timeline.authOpacity <= 0.05}
            >
              <div
                className="page-wrap rl-content rl-content-auth"
                style={{
                  transform: `translateY(${lerp(28, 0, segmentProgress(progress, 0.8, 1))}px)`,
                  transition: isReducedMotion ? 'none' : 'transform 180ms ease-in',
                }}
              >
                <article className={`${timeline.authOpacity > 0.05 ? 'rise-in ' : ''}rl-auth-card`.trim()}>
                  <p className="rl-chip">Ready to start</p>
                  <h2 id="landing-auth-title" className="display-title m-0 rl-heading">
                    Log in or sign up and continue building with Whobee.
                  </h2>
                  <p className="m-0 rl-lead">
                    Access your projects, open the workspace, and start collaborating immediately.
                  </p>
                  <div className="rl-actions">
                    <Link to="/auth" search={{ mode: 'login' }} className="rl-btn rl-btn-primary">
                      <LogIn size={16} aria-hidden="true" />
                      Log in
                    </Link>
                    <Link to="/auth" search={{ mode: 'register' }} className="rl-btn rl-btn-secondary">
                      <UserPlus size={16} aria-hidden="true" />
                      Sign up
                    </Link>
                  </div>
                </article>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  )
}
