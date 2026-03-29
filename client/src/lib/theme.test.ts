import { describe, expect, it } from 'vitest'
import {
  DEFAULT_THEME_PRESET,
  resolveThemePreset,
  THEME_INIT_SCRIPT,
  THEME_PRESET_IDS,
  THEME_STORAGE_KEY,
} from './theme'

describe('resolveThemePreset', () => {
  it('returns preset when valid', () => {
    expect(resolveThemePreset('light')).toBe('light')
    expect(resolveThemePreset('midnight')).toBe('midnight')
  })

  it('falls back for invalid values', () => {
    expect(resolveThemePreset('auto')).toBe(DEFAULT_THEME_PRESET)
    expect(resolveThemePreset('unknown')).toBe(DEFAULT_THEME_PRESET)
    expect(resolveThemePreset(undefined)).toBe(DEFAULT_THEME_PRESET)
    expect(resolveThemePreset(null)).toBe(DEFAULT_THEME_PRESET)
  })
})

describe('theme constants', () => {
  it('contains expected storage key and init script', () => {
    expect(THEME_STORAGE_KEY).toBe('themePreset')
    expect(THEME_PRESET_IDS.length).toBeGreaterThan(1)
    expect(THEME_INIT_SCRIPT).toContain('localStorage')
    expect(THEME_INIT_SCRIPT).toContain('data-theme')
  })
})
