import { describe, expect, it } from 'vitest'
import { shouldSendQueuedCommand } from './terminal-queued-command'

describe('shouldSendQueuedCommand', () => {
  it('returns true only when queued command is new, writable, and session is open', () => {
    expect(shouldSendQueuedCommand({
      queuedCommand: {
        id: 2,
        command: "node -- 'src/app.js'",
      },
      lastExecutedCommandId: 1,
      canWriteToActiveTerminal: true,
      isSessionOpen: true,
    })).toBe(true)
  })

  it('returns false when command is missing', () => {
    expect(shouldSendQueuedCommand({
      queuedCommand: null,
      lastExecutedCommandId: 0,
      canWriteToActiveTerminal: true,
      isSessionOpen: true,
    })).toBe(false)
  })

  it('returns false when queued command is already executed', () => {
    expect(shouldSendQueuedCommand({
      queuedCommand: {
        id: 1,
        command: "node -- 'src/app.js'",
      },
      lastExecutedCommandId: 1,
      canWriteToActiveTerminal: true,
      isSessionOpen: true,
    })).toBe(false)
  })

  it('returns false when terminal is not writable', () => {
    expect(shouldSendQueuedCommand({
      queuedCommand: {
        id: 2,
        command: "node -- 'src/app.js'",
      },
      lastExecutedCommandId: 1,
      canWriteToActiveTerminal: false,
      isSessionOpen: true,
    })).toBe(false)
  })

  it('returns false when terminal session is closed', () => {
    expect(shouldSendQueuedCommand({
      queuedCommand: {
        id: 2,
        command: "node -- 'src/app.js'",
      },
      lastExecutedCommandId: 1,
      canWriteToActiveTerminal: true,
      isSessionOpen: false,
    })).toBe(false)
  })
})
