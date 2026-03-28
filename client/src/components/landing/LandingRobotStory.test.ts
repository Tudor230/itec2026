import { describe, expect, it } from 'vitest'

import { resolveLandingActionVariant } from './LandingRobotStory'

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
