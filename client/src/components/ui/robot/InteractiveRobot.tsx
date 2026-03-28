import type { RobotSection } from './useRobotHeadMotion'

import type { CSSProperties } from 'react'
import { useEffect, useState } from 'react'

import { RobotBody } from './RobotBody'
import { RobotHead } from './RobotHead'
import { useRobotHeadMotion } from './useRobotHeadMotion'

interface InteractiveRobotProps {
  className?: string
  section: RobotSection
  zoom?: number
  progress?: number
}

export function InteractiveRobot({ className, section, zoom = 1, progress }: InteractiveRobotProps) {
  const { isTransitioning, style } = useRobotHeadMotion(section, zoom)
  const [eyeAim, setEyeAim] = useState({ x: '0px', y: '0px' })
  const [phase, setPhase] = useState(0)

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const xRatio = event.clientX / Math.max(window.innerWidth, 1) - 0.5
      const yRatio = event.clientY / Math.max(window.innerHeight, 1) - 0.5
      const x = Math.max(-14, Math.min(14, xRatio * 28))
      const y = Math.max(-12, Math.min(12, yRatio * 24))
      setEyeAim({ x: `${x.toFixed(2)}px`, y: `${y.toFixed(2)}px` })
    }

    window.addEventListener('pointermove', onPointerMove)

    return () => {
      window.removeEventListener('pointermove', onPointerMove)
    }
  }, [])

  useEffect(() => {
    if (typeof progress === 'number') {
      return
    }

    let rafId = 0
    let start = 0

    const tick = (time: number) => {
      if (start === 0) {
        start = time
      }

      const elapsed = time - start
      const duration = 4400
      const nextPhase = (elapsed % duration) / duration
      setPhase(nextPhase)
      rafId = window.requestAnimationFrame(tick)
    }

    rafId = window.requestAnimationFrame(tick)

    return () => {
      window.cancelAnimationFrame(rafId)
    }
  }, [])

  const effectivePhase = typeof progress === 'number' ? progress : phase
  const headWave = Math.sin(effectivePhase * Math.PI * 2)
  const bob = Number.parseFloat(style['--robot-head-bob'].replace('px', ''))
  const bobOffset = -headWave * bob
  const neckGap = 4 + ((headWave + 1) / 2) * 9
  const shiftX = style['--robot-head-shift-x']
  const shiftY = style['--robot-head-shift-y']
  const tilt = style['--robot-head-tilt']
  const yaw = style['--robot-head-yaw']

  const headStyle = {
    transform: `translate3d(${shiftX}, calc(${shiftY} + ${bobOffset.toFixed(2)}px), 0) rotateX(${tilt}) rotateY(${yaw})`,
  } as CSSProperties

  const eyeStyle = {
    transform: `translate3d(calc(${eyeAim.x} * 0.65), calc(${eyeAim.y} * 0.65), 0)`,
  } as CSSProperties

  const neckStackStyle = {
    gap: `${neckGap.toFixed(2)}px`,
    transform: `translateX(calc(${shiftX} * 0.18))`,
    transition: 'transform 620ms cubic-bezier(0.2, 0.9, 0.24, 1)',
  } as CSSProperties

  const neckTopStyle = { transform: `translateY(${(bobOffset * 0.34).toFixed(2)}px)` } as CSSProperties
  const neckMidStyle = { transform: `translateY(${(bobOffset * 0.52).toFixed(2)}px)` } as CSSProperties
  const neckBaseStyle = { transform: `translateY(${(bobOffset * 0.7).toFixed(2)}px)` } as CSSProperties

  const shellStyle = {
    ...style,
  } as CSSProperties

  return (
    <div className={`${className ?? ''} relative grid h-full w-full place-items-center [perspective:1100px]`.trim()} style={shellStyle}>
      <div
        className="grid h-full [height:min(620px,100%)] [width:min(540px,92%)] [grid-template-rows:auto_auto] content-start justify-items-center [transform-style:preserve-3d] [filter:drop-shadow(0_22px_42px_color-mix(in_oklab,#000000_66%,var(--sea-ink)_34%))]"
        role="presentation"
        aria-hidden="true"
      >
        <RobotHead transitioning={isTransitioning} headStyle={headStyle} eyeStyle={eyeStyle} />
        <RobotBody
          neckStackStyle={neckStackStyle}
          neckTopStyle={neckTopStyle}
          neckMidStyle={neckMidStyle}
          neckBaseStyle={neckBaseStyle}
        />
      </div>
    </div>
  )
}
