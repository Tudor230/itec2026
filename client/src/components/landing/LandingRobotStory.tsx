import { Link } from '@tanstack/react-router'
import { ArrowDown, LogIn, Sparkles, UserPlus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { InteractiveRobot } from '../ui/robot/InteractiveRobot'

type SectionKey = 'hero' | 'split' | 'auth'

export default function LandingRobotStory() {
  const shellRef = useRef<HTMLElement | null>(null)
  const [activeSection, setActiveSection] = useState<SectionKey>('hero')
  const [robotZoom, setRobotZoom] = useState(1)
  const heroRef = useRef<HTMLElement | null>(null)
  const splitRef = useRef<HTMLElement | null>(null)
  const authRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const sections: Array<{ key: SectionKey; node: HTMLElement | null }> = [
      { key: 'hero', node: heroRef.current },
      { key: 'split', node: splitRef.current },
      { key: 'auth', node: authRef.current },
    ]

    const validSections = sections.filter((entry) => entry.node)

    if (!validSections.length) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const intersecting = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)

        if (intersecting.length === 0) {
          return
        }

        const top = intersecting[0].target as HTMLElement
        const found = validSections.find((entry) => entry.node === top)

        if (found) {
          setActiveSection((current) => (current === found.key ? current : found.key))

          if (found.key === 'hero') {
            setRobotZoom(1)
          } else if (found.key === 'split') {
            setRobotZoom(0.86)
          } else {
            setRobotZoom(0.76)
          }
        }
      },
      {
        root: shellRef.current,
        threshold: [0.35, 0.5, 0.65, 0.8],
        rootMargin: '-12% 0px -12% 0px',
      },
    )

    validSections.forEach((entry) => {
      if (entry.node) {
        observer.observe(entry.node)
      }
    })

    return () => {
      observer.disconnect()
    }
  }, [])

  return (
    <main ref={shellRef} className="rl-shell" aria-label="Interactive robot landing">
      <div className={`rl-robot-layer rl-robot-layer--${activeSection}`} aria-hidden="true">
        <InteractiveRobot className="rl-robot-canvas" section={activeSection} zoom={robotZoom} />
      </div>

      <section ref={heroRef} className="rl-panel rl-panel-hero" aria-labelledby="landing-title">
        <div className="page-wrap rl-content rl-content-hero">
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
        ref={splitRef}
        className="rl-panel rl-panel-split"
        aria-labelledby="landing-value-title"
      >
        <div className="page-wrap rl-content rl-content-split">
          <article className="rise-in rl-info-block" id="features">
            <p className="rl-chip">Platform value</p>
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

      <section ref={authRef} className="rl-panel rl-panel-auth" aria-labelledby="landing-auth-title">
        <div className="page-wrap rl-content rl-content-auth">
          <article className="rise-in rl-auth-card">
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
    </main>
  )
}
