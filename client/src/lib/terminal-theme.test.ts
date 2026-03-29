import { describe, expect, it } from 'vitest'
import { resolveTerminalTheme } from './terminal-theme'

describe('resolveTerminalTheme', () => {
  it('returns light preset terminal palette', () => {
    const theme = resolveTerminalTheme('light')
    expect(theme.background).toBe('#eef7f5')
    expect(theme.cursor).toBe('#2f8f97')
  })

  it('returns dark-family palettes with readable foreground contrast', () => {
    const darkTheme = resolveTerminalTheme('dark')
    const draculaTheme = resolveTerminalTheme('dracula')
    const nordTheme = resolveTerminalTheme('nord')
    const midnightTheme = resolveTerminalTheme('midnight')

    expect(darkTheme.background).not.toBe(darkTheme.foreground)
    expect(draculaTheme.background).not.toBe(draculaTheme.foreground)
    expect(nordTheme.background).not.toBe(nordTheme.foreground)
    expect(midnightTheme.background).not.toBe(midnightTheme.foreground)
  })

  it('returns solarized palette with stable cursor accent', () => {
    const theme = resolveTerminalTheme('solarized')
    expect(theme.cursor).toBe('#268bd2')
    expect(theme.cursorAccent).toBe('#fdf5e3')
  })
})
