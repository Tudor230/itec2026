import { describe, expect, it } from 'vitest'
import {
  getRobotEyeTarget,
  getRobotHeadPose,
  mapZoomToBobAmplitude,
  resolveRobotEyeTarget,
  resolveRobotReactionPose,
} from './useRobotHeadMotion'

describe('robot head motion helpers', () => {
  it('maps section to deterministic pose values', () => {
    const heroPose = getRobotHeadPose('hero')
    expect(heroPose.tilt).toBe('-4deg')
    expect(heroPose.yaw).toBe('0deg')
    expect(heroPose.shiftX).toBe('0px')

    const authPose = getRobotHeadPose('auth')
    expect(authPose.yaw).toBe('14deg')
    expect(authPose.shiftX).toBe('10px')
  })

  it('scales bob amplitude from zoom', () => {
    const compactBob = Number.parseFloat(mapZoomToBobAmplitude(0.76))
    const wideBob = Number.parseFloat(mapZoomToBobAmplitude(1))

    expect(wideBob).toBeGreaterThan(compactBob)
  })

  it('maps deterministic eye targets by section', () => {
    const splitTarget = getRobotEyeTarget('split')
    const authTarget = getRobotEyeTarget('auth')

    expect(splitTarget.x).toBeLessThan(0)
    expect(authTarget.x).toBeGreaterThan(0)
    expect(Math.abs(splitTarget.y)).toBeGreaterThan(7)
  })

  it('exaggerates pose and eye target when focus lock is enabled', () => {
    const relaxedPose = resolveRobotReactionPose('split', false)
    const focusedPose = resolveRobotReactionPose('split', true)
    const relaxedEyeTarget = resolveRobotEyeTarget('auth', false)
    const focusedEyeTarget = resolveRobotEyeTarget('auth', true)

    expect(Number.parseFloat(focusedPose.yaw)).toBeLessThan(
      Number.parseFloat(relaxedPose.yaw),
    )
    expect(Math.abs(focusedEyeTarget.x)).toBeGreaterThan(
      Math.abs(relaxedEyeTarget.x) * 2,
    )
    expect(Math.abs(focusedEyeTarget.y)).toBeGreaterThan(
      Math.abs(relaxedEyeTarget.y) * 2,
    )
  })
})
