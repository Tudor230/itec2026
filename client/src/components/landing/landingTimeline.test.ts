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
    const inCrossFade = deriveLandingTimeline(0.2)
    const atPhilosophyWindow = deriveLandingTimeline(0.44)
    const atScopeWindow = deriveLandingTimeline(0.97)
    const atEnd = deriveLandingTimeline(1)

    expect(atStart.heroOpacity).toBe(1)
    expect(atStart.philosophyOpacity).toBe(0)
    expect(atStart.scopeOpacity).toBe(0)
    expect(atStart.robotOpacity).toBeCloseTo(0.24)

    expect(inCrossFade.heroOpacity).toBeLessThan(0.6)
    expect(inCrossFade.robotOpacity).toBeGreaterThan(0.5)

    expect(atPhilosophyWindow.philosophyOpacity).toBeGreaterThan(0.8)
    expect(atScopeWindow.scopeOpacity).toBeGreaterThan(0.8)
    expect(atScopeWindow.heroOpacity).toBe(0)

    expect(atPhilosophyWindow.robotX).toBeGreaterThan(18)
    expect(atScopeWindow.robotX).toBeLessThan(0)
    expect(atStart.robotZoom).toBeCloseTo(0.94)
    expect(atEnd.robotZoom).toBeCloseTo(0.94)

    expect(atEnd.philosophyOpacity).toBe(0)
    expect(atEnd.scopeOpacity).toBe(1)
    expect(atEnd.robotX).toBeCloseTo(-24)
    expect(atEnd.scopeX).toBeCloseTo(132)
  })
})
