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
}

export function InteractiveRobot({ className, section, zoom = 1 }: InteractiveRobotProps) {
  const { poseClassName, isTransitioning, style } = useRobotHeadMotion(section, zoom)
  const [eyeAim, setEyeAim] = useState({ x: '0px', y: '0px' })

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const xRatio = event.clientX / Math.max(window.innerWidth, 1) - 0.5
      const yRatio = event.clientY / Math.max(window.innerHeight, 1) - 0.5
      const x = Math.max(-7, Math.min(7, xRatio * 16))
      const y = Math.max(-6, Math.min(6, yRatio * 14))
      setEyeAim({ x: `${x.toFixed(2)}px`, y: `${y.toFixed(2)}px` })
    }

    window.addEventListener('pointermove', onPointerMove)

    return () => {
      window.removeEventListener('pointermove', onPointerMove)
    }
  }, [])

  const mergedStyle = {
    ...style,
    '--robot-eye-aim-x': eyeAim.x,
    '--robot-eye-aim-y': eyeAim.y,
  } as CSSProperties

  return (
    <div className={`${className ?? ''} rl-robot-shell ${poseClassName}`.trim()} style={mergedStyle}>
      <div className="rl-robot" role="presentation" aria-hidden="true">
        <RobotHead transitioning={isTransitioning} />
        <RobotBody />
      </div>
    </div>
  )
}
