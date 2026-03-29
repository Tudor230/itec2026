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

interface RobotEyeTarget {
  x: number
  y: number
}

interface RobotHeadMotion {
  isTransitioning: boolean
  isFocusLocked: boolean
  eyeTarget: RobotEyeTarget
  style: RobotHeadStyleVars
}

interface PoseVars {
  tilt: string
  yaw: string
  shiftX: string
  shiftY: string
}

const REACTION_POSE_BY_SECTION: Record<RobotSection, PoseVars> = {
  hero: {
    tilt: '0deg',
    yaw: '0deg',
    shiftX: '0px',
    shiftY: '0px',
  },
  split: {
    tilt: '-9deg',
    yaw: '-16deg',
    shiftX: '-14px',
    shiftY: '-6px',
  },
  auth: {
    tilt: '-7deg',
    yaw: '18deg',
    shiftX: '16px',
    shiftY: '-4px',
  },
}

const EYE_TARGET_BY_SECTION: Record<RobotSection, RobotEyeTarget> = {
  hero: { x: 0, y: -1 },
  split: { x: -14, y: -8 },
  auth: { x: 15, y: -8 },
}

function isInfoSection(section: RobotSection) {
  return section === 'split' || section === 'auth'
}

function addUnit(base: string, delta: string) {
  const unit = base.endsWith('deg') ? 'deg' : 'px'
  const nextValue = Number.parseFloat(base) + Number.parseFloat(delta)
  return `${nextValue.toFixed(2)}${unit}`
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

export function getRobotEyeTarget(section: RobotSection): RobotEyeTarget {
  return EYE_TARGET_BY_SECTION[section]
}

export function resolveRobotReactionPose(
  section: RobotSection,
  focusLocked: boolean,
): PoseVars {
  const pose = getRobotHeadPose(section)

  if (!focusLocked) {
    return pose
  }

  const reactionPose = REACTION_POSE_BY_SECTION[section]

  return {
    tilt: addUnit(pose.tilt, reactionPose.tilt),
    yaw: addUnit(pose.yaw, reactionPose.yaw),
    shiftX: addUnit(pose.shiftX, reactionPose.shiftX),
    shiftY: addUnit(pose.shiftY, reactionPose.shiftY),
  }
}

export function resolveRobotEyeTarget(
  section: RobotSection,
  focusLocked: boolean,
): RobotEyeTarget {
  const baseEyeTarget = getRobotEyeTarget(section)

  if (!focusLocked) {
    return baseEyeTarget
  }

  return {
    x: baseEyeTarget.x * 2.4,
    y: baseEyeTarget.y * 2.1,
  }
}

export function useRobotHeadMotion(
  section: RobotSection,
  zoom: number,
  shouldAnimate = true,
): RobotHeadMotion {
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [isEyeFocusLocked, setIsEyeFocusLocked] = useState(false)
  const previousSectionRef = useRef<RobotSection>(section)

  useEffect(() => {
    if (!shouldAnimate) {
      previousSectionRef.current = section
      setIsTransitioning(false)
      setIsEyeFocusLocked(false)
      return
    }

    if (previousSectionRef.current === section) {
      return
    }

    previousSectionRef.current = section
    setIsTransitioning(true)
    setIsEyeFocusLocked(true)

    const transitionTimeoutId = window.setTimeout(() => {
      setIsTransitioning(false)
    }, 620)

    const focusTimeoutId = window.setTimeout(() => {
      setIsEyeFocusLocked(false)
    }, 1000)

    return () => {
      window.clearTimeout(transitionTimeoutId)
      window.clearTimeout(focusTimeoutId)
    }
  }, [section, shouldAnimate])

  const effectiveHeadFocus = shouldAnimate && isInfoSection(section)
  const effectiveEyeFocus = shouldAnimate && isEyeFocusLocked
  const effectivePose = resolveRobotReactionPose(section, effectiveHeadFocus)
  const effectiveEyeTarget = resolveRobotEyeTarget(section, effectiveEyeFocus)

  const style = useMemo<RobotHeadStyleVars>(
    () => ({
      '--robot-head-tilt': effectivePose.tilt,
      '--robot-head-yaw': effectivePose.yaw,
      '--robot-head-shift-x': effectivePose.shiftX,
      '--robot-head-shift-y': effectivePose.shiftY,
      '--robot-head-bob': mapZoomToBobAmplitude(zoom),
    }),
    [
      effectivePose.shiftX,
      effectivePose.shiftY,
      effectivePose.tilt,
      effectivePose.yaw,
      zoom,
    ],
  )

  return {
    isTransitioning,
    isFocusLocked: effectiveEyeFocus,
    eyeTarget: effectiveEyeTarget,
    style,
  }
}
