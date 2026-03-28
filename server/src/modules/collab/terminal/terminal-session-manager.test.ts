import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { TerminalSessionManager } from './terminal-session-manager.js'
import type { RuntimeOutputChunk, RuntimeTerminalSize, TerminalRuntime } from './terminal-runtime.js'

function waitForTick() {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })
}

function createDeferred() {
  let resolve!: () => void
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve
  })

  return {
    promise,
    resolve,
  }
}

class RuntimeDouble implements TerminalRuntime {
  constructor(
    private readonly events: string[],
    private readonly prewarmDeferred: ReturnType<typeof createDeferred>,
  ) {}

  async prewarm(): Promise<void> {
    this.events.push('prewarm:start')
    await this.prewarmDeferred.promise
    this.events.push('prewarm:end')
  }

  async openSession(
    _context: { cwd: string; projectId: string; ownerSubject: string },
    _onOutput: (chunk: RuntimeOutputChunk) => void,
    _initialSize?: RuntimeTerminalSize,
  ): Promise<void> {
    this.events.push('openSession')
  }

  async writeInput(): Promise<void> {
    this.events.push('writeInput')
  }

  async resizeSession(): Promise<void> {
    this.events.push('resizeSession')
  }

  async closeSession(): Promise<void> {
    this.events.push('closeSession')
  }

  dispose(): void {
    this.events.push('dispose')
  }
}

describe('terminal session manager', () => {
  const deferreds: Array<ReturnType<typeof createDeferred>> = []

  afterEach(() => {
    deferreds.splice(0).forEach((deferred) => {
      deferred.resolve()
    })
  })

  it('runs beforeSessionOpen before waiting for pending prewarm', async () => {
    const events: string[] = []
    const prewarmDeferred = createDeferred()
    deferreds.push(prewarmDeferred)

    const manager = new TerminalSessionManager(
      () => new RuntimeDouble(events, prewarmDeferred),
      {
        beforeSessionOpen: async () => {
          events.push('beforeSessionOpen')
        },
      },
      {
        resolveDefaultCwd: () => '/workspace/project',
      },
    )

    manager.markProjectJoined('project-1', 'owner-1')

    const prewarmPromise = manager.prewarmTerminal('project-1', 'owner-1')
    await waitForTick()

    const openPromise = manager.openSession('project-1', 'owner-1', 'owner-1', () => undefined, {
      cols: 120,
      rows: 40,
    })

    await waitForTick()

    assert.ok(events.includes('beforeSessionOpen'))
    assert.equal(events.includes('openSession'), false)

    prewarmDeferred.resolve()

    await Promise.all([prewarmPromise, openPromise])

    const beforeIndex = events.indexOf('beforeSessionOpen')
    const prewarmEndIndex = events.indexOf('prewarm:end')
    const openIndex = events.indexOf('openSession')

    assert.ok(beforeIndex >= 0)
    assert.ok(prewarmEndIndex >= 0)
    assert.ok(openIndex >= 0)
    assert.ok(beforeIndex < prewarmEndIndex)
    assert.ok(prewarmEndIndex < openIndex)
  })

  it('keeps owner writable after approving collaborator access', async () => {
    const events: string[] = []
    const manager = new TerminalSessionManager(
      () => new RuntimeDouble(events, createDeferred()),
      undefined,
      {
        resolveDefaultCwd: () => '/workspace/project',
      },
    )

    const projectId = 'project-1'
    const ownerSubject = 'owner-1'
    const collaboratorSubject = 'viewer-1'

    manager.markProjectJoined(projectId, ownerSubject)
    manager.markProjectJoined(projectId, collaboratorSubject)

    const requested = manager.requestAccess(projectId, ownerSubject, collaboratorSubject)
    assert.ok(requested)

    const decision = manager.decideAccess(projectId, ownerSubject, collaboratorSubject, true)
    assert.equal(decision.ok, true)
    assert.equal(decision.state.activeControllerSubject, collaboratorSubject)

    const openedByOwner = await manager.openSession(
      projectId,
      ownerSubject,
      ownerSubject,
      () => undefined,
      { cols: 120, rows: 40 },
    )
    assert.equal(openedByOwner.accepted, true)

    const ownerInput = await manager.processInput(projectId, ownerSubject, ownerSubject, 'echo owner\n')
    assert.equal(ownerInput.accepted, true)

    const collaboratorInput = await manager.processInput(
      projectId,
      ownerSubject,
      collaboratorSubject,
      'echo collaborator\n',
    )
    assert.equal(collaboratorInput.accepted, true)
  })

  it('revokes collaborator while preserving owner write access', async () => {
    const events: string[] = []
    const manager = new TerminalSessionManager(
      () => new RuntimeDouble(events, createDeferred()),
      undefined,
      {
        resolveDefaultCwd: () => '/workspace/project',
      },
    )

    const projectId = 'project-1'
    const ownerSubject = 'owner-1'
    const collaboratorSubject = 'viewer-1'

    manager.markProjectJoined(projectId, ownerSubject)
    manager.markProjectJoined(projectId, collaboratorSubject)

    manager.requestAccess(projectId, ownerSubject, collaboratorSubject)
    const decision = manager.decideAccess(projectId, ownerSubject, collaboratorSubject, true)
    assert.equal(decision.ok, true)

    const openedByOwner = await manager.openSession(
      projectId,
      ownerSubject,
      ownerSubject,
      () => undefined,
      { cols: 120, rows: 40 },
    )
    assert.equal(openedByOwner.accepted, true)

    const revoke = manager.revokeControl(projectId, ownerSubject)
    assert.equal(revoke.ok, true)
    assert.equal(revoke.revokedSubject, collaboratorSubject)
    assert.equal(revoke.state?.activeControllerSubject, ownerSubject)

    const collaboratorInput = await manager.processInput(
      projectId,
      ownerSubject,
      collaboratorSubject,
      'echo collaborator\n',
    )
    assert.equal(collaboratorInput.accepted, false)
    assert.equal(collaboratorInput.reason, 'Terminal is read-only for this user')

    const ownerInput = await manager.processInput(projectId, ownerSubject, ownerSubject, 'echo owner\n')
    assert.equal(ownerInput.accepted, true)
  })
})
