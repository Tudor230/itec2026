import type { CSSProperties } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'

export type RobotSection = 'hero' | 'split' | 'auth'

export type RobotHeadStyleVars = CSSProperties & {
  '--robot-head-tilt': string
  '--robot-head-yaw': string
  '--robot-head-shift-x': string
  '--robot-head-shift-y': string
  '--robot-head-bob': string
}

interface RobotHeadMotion {
  isTransitioning: boolean
  style: RobotHeadStyleVars
}

interface PoseVars {
  tilt: string
  yaw: string
  shiftX: string
  shiftY: string
}

const POSE_BY_SECTION: Record<RobotSection, PoseVars> = {
  hero: {
    tilt: '-4deg',
    yaw: '0deg',
    shiftX: '0px',
    shiftY: '-2px',
  },
  split: {
    tilt: '-8deg',
    yaw: '-12deg',
    shiftX: '-8px',
    shiftY: '-3px',
  },
  auth: {
    tilt: '-2deg',
    yaw: '14deg',
    shiftX: '10px',
    shiftY: '1px',
  },
}

export function mapZoomToBobAmplitude(zoom: number) {
  const clampedZoom = Math.min(1.08, Math.max(0.7, zoom))
  const normalized = (clampedZoom - 0.7) / 0.38
  const amplitude = 5 + normalized * 6
  return `${amplitude.toFixed(2)}px`
}

export function getRobotHeadPose(section: RobotSection): PoseVars {
  return POSE_BY_SECTION[section]
}

export function useRobotHeadMotion(section: RobotSection, zoom: number): RobotHeadMotion {
  const [isTransitioning, setIsTransitioning] = useState(false)
  const previousSectionRef = useRef<RobotSection>(section)

  useEffect(() => {
    if (previousSectionRef.current === section) {
      return
    }

    previousSectionRef.current = section
    setIsTransitioning(true)

    const timeoutId = window.setTimeout(() => {
      setIsTransitioning(false)
    }, 620)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [section])

  const pose = getRobotHeadPose(section)

  const style = useMemo<RobotHeadStyleVars>(
    () => ({
      '--robot-head-tilt': pose.tilt,
      '--robot-head-yaw': pose.yaw,
      '--robot-head-shift-x': pose.shiftX,
      '--robot-head-shift-y': pose.shiftY,
      '--robot-head-bob': mapZoomToBobAmplitude(zoom),
    }),
    [pose.shiftX, pose.shiftY, pose.tilt, pose.yaw, zoom],
  )

  return {
    isTransitioning,
    style,
  }
}
