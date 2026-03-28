import { describe, expect, it } from 'vitest'

import { clamp01, deriveLandingTimeline, easeOutCubic, lerp, nearestSnapPoint, segmentProgress } from './landingTimeline'

describe('landing timeline helpers', () => {
  it('clamps values between 0 and 1', () => {
    expect(clamp01(-2)).toBe(0)
    expect(clamp01(0.35)).toBe(0.35)
    expect(clamp01(3)).toBe(1)
  })

  it('computes normalized segment progress', () => {
    expect(segmentProgress(0.1, 0.2, 0.5)).toBe(0)
    expect(segmentProgress(0.35, 0.2, 0.5)).toBeCloseTo(0.5)
    expect(segmentProgress(0.9, 0.2, 0.5)).toBe(1)
  })

  it('finds nearest snap point', () => {
    const points = [0, 0.5, 1] as const
    expect(nearestSnapPoint(0.08, points)).toBe(0)
    expect(nearestSnapPoint(0.61, points)).toBe(0.5)
    expect(nearestSnapPoint(0.88, points)).toBe(1)
  })

  it('interpolates and eases predictably', () => {
    expect(lerp(0, 100, 0.25)).toBe(25)
    expect(easeOutCubic(0)).toBe(0)
    expect(easeOutCubic(1)).toBe(1)
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5)
  })

  it('derives expected timeline states across anchors', () => {
    const atStart = deriveLandingTimeline(0)
    const atFirstMoveEnd = deriveLandingTimeline(0.4)
    const atStageTwoHold = deriveLandingTimeline(0.5)
    const atSecondMoveStart = deriveLandingTimeline(0.6)
    const nearEnd = deriveLandingTimeline(0.99)
    const atEnd = deriveLandingTimeline(1)

    expect(atStart.heroOpacity).toBe(1)
    expect(atStart.infoOpacity).toBe(0)
    expect(atStart.authOpacity).toBe(0)
    expect(atStart.robotX).toBe(0)

    expect(atFirstMoveEnd.robotX).toBeCloseTo(30)
    expect(atStageTwoHold.robotX).toBeCloseTo(30)
    expect(atSecondMoveStart.robotX).toBeCloseTo(30)
    expect(atStageTwoHold.infoOpacity).toBe(1)

    expect(nearEnd.robotX).toBeCloseTo(-30)
    expect(nearEnd.authOpacity).toBeGreaterThan(0.9)

    expect(atEnd.authOpacity).toBe(1)
    expect(atEnd.infoOpacity).toBe(0)
    expect(atEnd.robotX).toBeCloseTo(-30)
  })
})
