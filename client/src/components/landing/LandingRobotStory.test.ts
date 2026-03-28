import { describe, expect, it } from 'vitest'

import {
  clampIntroProgress,
  resolveLandingActionVariant,
  resolveVisualProgress,
  shouldRelockIntro,
  shouldUnlockIntro,
} from './LandingRobotStory'

describe('LandingRobotStory action variant resolver', () => {
  it('returns guest when auth runtime is not configured', () => {
    expect(
      resolveLandingActionVariant({
        isConfigured: false,
        isLoading: false,
        isAuthenticated: false,
      }),
    ).toBe('guest')
  })

  it('returns loading while auth state is resolving', () => {
    expect(
      resolveLandingActionVariant({
        isConfigured: true,
        isLoading: true,
        isAuthenticated: false,
      }),
    ).toBe('loading')
  })

  it('returns authenticated when runtime is configured and user is signed in', () => {
    expect(
      resolveLandingActionVariant({
        isConfigured: true,
        isLoading: false,
        isAuthenticated: true,
      }),
    ).toBe('authenticated')
  })

  it('returns guest when runtime is configured but user is signed out', () => {
    expect(
      resolveLandingActionVariant({
        isConfigured: true,
        isLoading: false,
        isAuthenticated: false,
      }),
    ).toBe('guest')
  })
})

describe('LandingRobotStory relock predicate', () => {
  it('relocks when unlocked, at top, and scrolling upward', () => {
    expect(shouldRelockIntro(false, true, -24)).toBe(true)
  })

  it('does not relock when already locked', () => {
    expect(shouldRelockIntro(true, true, -24)).toBe(false)
  })

  it('does not relock when not at top', () => {
    expect(shouldRelockIntro(false, false, -24)).toBe(false)
  })

  it('does not relock on downward scroll', () => {
    expect(shouldRelockIntro(false, true, 24)).toBe(false)
  })
})

describe('LandingRobotStory intro progress gating', () => {
  it('caps unlock progress and preserves visual progress cap', () => {
    expect(clampIntroProgress(2)).toBeCloseTo(1.18)
    expect(resolveVisualProgress(1.18)).toBe(1)
  })

  it('unlocks only after extra hold threshold', () => {
    expect(shouldUnlockIntro(1)).toBe(false)
    expect(shouldUnlockIntro(1.17)).toBe(false)
    expect(shouldUnlockIntro(1.18)).toBe(true)
  })
})
