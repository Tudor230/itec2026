import { describe, expect, it } from 'vitest'
import { getRobotHeadPose, mapZoomToBobAmplitude } from './useRobotHeadMotion'

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
})
