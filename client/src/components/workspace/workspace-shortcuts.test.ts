import { describe, expect, it } from 'vitest'
import { getWorkspaceShortcut } from './workspace-shortcuts'

function keyboardEventLike(overrides: Partial<{
  ctrlKey: boolean
  metaKey: boolean
  key: string
  code: string
  target: EventTarget | null
}> = {}) {
  return {
    ctrlKey: false,
    metaKey: false,
    key: '',
    code: '',
    target: null,
    ...overrides,
  }
}

describe('getWorkspaceShortcut', () => {
  it('maps save shortcut', () => {
    const shortcut = getWorkspaceShortcut(
      keyboardEventLike({ ctrlKey: true, key: 's' }),
    )

    expect(shortcut).toBe('save')
  })

  it('maps quick open and command palette shortcuts', () => {
    const quickOpen = getWorkspaceShortcut(
      keyboardEventLike({ ctrlKey: true, key: 'p' }),
    )
    const commandPalette = getWorkspaceShortcut(
      keyboardEventLike({ ctrlKey: true, key: '/', code: 'Slash' }),
    )

    expect(quickOpen).toBe('quick-open')
    expect(commandPalette).toBe('command-palette')
  })

  it('maps sidebar and terminal toggles', () => {
    const sidebar = getWorkspaceShortcut(
      keyboardEventLike({ ctrlKey: true, key: 'b' }),
    )
    const terminal = getWorkspaceShortcut(
      keyboardEventLike({ ctrlKey: true, code: 'Backquote' }),
    )

    expect(sidebar).toBe('toggle-sidebar')
    expect(terminal).toBe('toggle-terminal')
  })

  it('ignores shortcuts while typing in an input', () => {
    const shortcut = getWorkspaceShortcut(
      keyboardEventLike({
        ctrlKey: true,
        key: 'p',
        target: { tagName: 'INPUT', isContentEditable: false } as unknown as EventTarget,
      }),
    )

    expect(shortcut).toBeNull()
  })

  it('returns null for non-mapped combinations', () => {
    const shortcut = getWorkspaceShortcut(
      keyboardEventLike({ ctrlKey: true, key: 'z' }),
    )

    expect(shortcut).toBeNull()
  })
})
