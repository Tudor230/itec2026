import type { RuntimeOutputChunk, RuntimeTerminalSize, TerminalRuntime } from './terminal-runtime.js'

interface PendingRequest {
  requesterSubject: string
  requestedAt: string
}

interface ProjectMembership {
  projectId: string
  subject: string
  connections: number
}

interface TerminalSession {
  projectId: string
  ownerSubject: string
  runtime: TerminalRuntime
  cwd: string
  activeControllerSubject: string
  grantedControllerSubject: string | null
  pendingRequests: Map<string, PendingRequest>
  operationChain: Promise<void>
  emitOutput: ((ownerSubject: string, chunk: RuntimeOutputChunk) => void) | null
  isSessionOpen: boolean
}

export interface TerminalDescriptor {
  ownerSubject: string
  activeControllerSubject: string
  pendingRequestCount: number
}

export interface TerminalStateSnapshot {
  projectId: string
  ownerSubject: string
  activeControllerSubject: string
  isSessionOpen: boolean
  pendingRequests: PendingRequest[]
}

interface JoinTerminalResult {
  created: boolean
  state: TerminalStateSnapshot
}

interface RequestAccessResult {
  ownerSubject: string
  requesterSubject: string
  requestedAt: string
}

interface DecisionResult {
  ok: boolean
  ownerSubject: string
  requesterSubject: string
  status: 'approved' | 'rejected'
  state: TerminalStateSnapshot
  reason?: string
}

interface OperationResult {
  accepted: boolean
  reason?: string
}

interface RuntimeFactoryInput {
  projectId: string
  ownerSubject: string
}

interface SessionHooks {
  beforeSessionOpen?: (args: { projectId: string; ownerSubject: string }) => Promise<void>
  afterSessionOpen?: (args: { projectId: string; ownerSubject: string }) => Promise<void>
  afterSessionClose?: (args: { projectId: string; ownerSubject: string }) => Promise<void>
}

interface TerminalSessionManagerOptions {
  resolveDefaultCwd?: (projectId: string) => string
}

function terminalKey(projectId: string, ownerSubject: string) {
  return `${projectId}::${ownerSubject}`
}

export class TerminalSessionManager {
  private readonly sessions = new Map<string, TerminalSession>()

  private readonly membershipsByProject = new Map<string, Map<string, ProjectMembership>>()

  private readonly runtimeFactory: (input: RuntimeFactoryInput) => TerminalRuntime

  private readonly sessionHooks: SessionHooks

  private readonly defaultCwdResolver: (projectId: string) => string

  private readonly pendingPrewarms = new Map<string, Promise<void>>()

  constructor(
    runtimeFactory: (input: RuntimeFactoryInput) => TerminalRuntime,
    sessionHooks?: SessionHooks,
    options?: TerminalSessionManagerOptions,
  ) {
    this.runtimeFactory = runtimeFactory
    this.sessionHooks = sessionHooks ?? {}
    this.defaultCwdResolver = options?.resolveDefaultCwd ?? ((projectId) => this.resolveDefaultCwd(projectId))
  }

  private resolveDefaultCwd(projectId: string) {
    const workspaceRoot = process.env.COLLAB_TERMINAL_WORKSPACE_ROOT
    if (workspaceRoot && workspaceRoot.trim()) {
      return `${workspaceRoot.replace(/[\\/]+$/, '')}/${projectId}`
    }

    return process.cwd()
  }

  private queueSessionOperation(session: TerminalSession, operation: () => Promise<void>) {
    const next = session.operationChain.then(operation)
    session.operationChain = next.catch(() => undefined)
    return next
  }

  private async runAfterSessionCloseHook(session: TerminalSession) {
    try {
      await this.sessionHooks.afterSessionClose?.({
        projectId: session.projectId,
        ownerSubject: session.ownerSubject,
      })
    } catch {
      // Keep terminal actions stable even if optional close hook fails.
    }
  }

  private async reconcileSessionOpenState(session: TerminalSession) {
    if (!session.isSessionOpen) {
      return
    }

    if (session.runtime.isSessionOpen()) {
      return
    }

    session.isSessionOpen = false
    session.emitOutput = null
    await this.runAfterSessionCloseHook(session)
  }

  private emitRuntimeError(session: TerminalSession, error: unknown) {
    if (!session.emitOutput) {
      return
    }

    const message = error instanceof Error ? error.message : 'Unknown terminal runtime error'
    session.emitOutput(session.ownerSubject, {
      stream: 'stderr',
      chunk: `${message}\n`,
      timestamp: new Date().toISOString(),
    })
  }

  private canControlTerminal(session: TerminalSession, subject: string) {
    return subject === session.ownerSubject || subject === session.grantedControllerSubject
  }

  markProjectJoined(projectId: string, subject: string) {
    const projectMembers = this.membershipsByProject.get(projectId) ?? new Map<string, ProjectMembership>()
    const existing = projectMembers.get(subject)

    if (existing) {
      projectMembers.set(subject, {
        ...existing,
        connections: existing.connections + 1,
      })
    } else {
      projectMembers.set(subject, {
        projectId,
        subject,
        connections: 1,
      })
    }

    this.membershipsByProject.set(projectId, projectMembers)
  }

  prewarmTerminal(projectId: string, ownerSubject: string): Promise<void> {
    if (!this.isProjectMember(projectId, ownerSubject)) {
      return Promise.resolve()
    }

    const session = this.ensureSession(projectId, ownerSubject)
    const key = terminalKey(projectId, ownerSubject)
    const pending = this.pendingPrewarms.get(key)
    if (pending) {
      return pending
    }

    const prewarmPromise = (async () => {
      if (session.runtime.prewarm) {
        await session.runtime.prewarm({
          cwd: session.cwd,
          projectId,
          ownerSubject,
        })
      }
    })().finally(() => {
      this.pendingPrewarms.delete(key)
    })

    this.pendingPrewarms.set(key, prewarmPromise)
    return prewarmPromise
  }

  markProjectLeft(projectId: string, subject: string) {
    const projectMembers = this.membershipsByProject.get(projectId)
    if (!projectMembers) {
      return
    }

    const existing = projectMembers.get(subject)
    if (!existing) {
      return
    }

    if (existing.connections > 1) {
      projectMembers.set(subject, {
        ...existing,
        connections: existing.connections - 1,
      })
      return
    }

    projectMembers.delete(subject)
    if (projectMembers.size === 0) {
      this.membershipsByProject.delete(projectId)
    } else {
      this.membershipsByProject.set(projectId, projectMembers)
    }

    this.sessions.forEach((candidate) => {
      if (candidate.projectId !== projectId) {
        return
      }

      candidate.pendingRequests.delete(subject)
      if (candidate.grantedControllerSubject === subject) {
        candidate.grantedControllerSubject = null
        candidate.activeControllerSubject = candidate.ownerSubject
      } else if (candidate.activeControllerSubject === subject) {
        candidate.activeControllerSubject = candidate.ownerSubject
      }
    })

    const key = terminalKey(projectId, subject)
    this.pendingPrewarms.delete(key)
    const session = this.sessions.get(key)
    if (!session) {
      return
    }

    this.sessions.delete(key)
    session.emitOutput = null

    const wasOpen = session.isSessionOpen
    session.isSessionOpen = false

    const context = {
      cwd: session.cwd,
      projectId: session.projectId,
      ownerSubject: session.ownerSubject,
    }

    if (wasOpen) {
      void session.runtime.closeSession(context).catch(() => undefined).finally(() => {
        void this.sessionHooks.afterSessionClose?.({
          projectId: session.projectId,
          ownerSubject: session.ownerSubject,
        }).catch(() => undefined).finally(() => {
          session.runtime.dispose()
        })
      })
      return
    }

    session.runtime.dispose()
  }

  listProjectTerminals(projectId: string): TerminalDescriptor[] {
    const projectMembers = this.membershipsByProject.get(projectId)
    if (!projectMembers) {
      return []
    }

    return [...projectMembers.keys()].sort().map((ownerSubject) => {
      const session = this.getExistingSession(projectId, ownerSubject)
      return {
        ownerSubject,
        activeControllerSubject: session?.activeControllerSubject ?? ownerSubject,
        pendingRequestCount: session?.pendingRequests.size ?? 0,
      }
    })
  }

  isProjectMember(projectId: string, subject: string) {
    const projectMembers = this.membershipsByProject.get(projectId)
    if (!projectMembers) {
      return false
    }

    return projectMembers.has(subject)
  }

  joinTerminal(projectId: string, ownerSubject: string): JoinTerminalResult | null {
    if (!this.isProjectMember(projectId, ownerSubject)) {
      return null
    }

    const existing = this.getExistingSession(projectId, ownerSubject)
    if (existing) {
      return {
        created: false,
        state: this.snapshotSession(existing),
      }
    }

    const created = this.ensureSession(projectId, ownerSubject)
    return {
      created: true,
      state: this.snapshotSession(created),
    }
  }

  getTerminalState(projectId: string, ownerSubject: string): TerminalStateSnapshot {
    const session = this.ensureSession(projectId, ownerSubject)
    return this.snapshotSession(session)
  }

  requestAccess(projectId: string, ownerSubject: string, requesterSubject: string): RequestAccessResult | null {
    if (ownerSubject === requesterSubject) {
      return null
    }

    if (!this.isProjectMember(projectId, requesterSubject) || !this.isProjectMember(projectId, ownerSubject)) {
      return null
    }

    const session = this.ensureSession(projectId, ownerSubject)
    if (session.activeControllerSubject === requesterSubject || session.grantedControllerSubject === requesterSubject) {
      return null
    }

    const pending: PendingRequest = {
      requesterSubject,
      requestedAt: new Date().toISOString(),
    }

    session.pendingRequests.set(requesterSubject, pending)

    return {
      ownerSubject,
      requesterSubject,
      requestedAt: pending.requestedAt,
    }
  }

  decideAccess(
    projectId: string,
    ownerSubject: string,
    requesterSubject: string,
    approve: boolean,
  ): DecisionResult {
    const session = this.getExistingSession(projectId, ownerSubject)
    if (!session) {
      return {
        ok: false,
        ownerSubject,
        requesterSubject,
        status: approve ? 'approved' : 'rejected',
        state: {
          projectId,
          ownerSubject,
          activeControllerSubject: ownerSubject,
          isSessionOpen: false,
          pendingRequests: [],
        },
        reason: 'Terminal session not found',
      }
    }

    if (!session.pendingRequests.has(requesterSubject)) {
      return {
        ok: false,
        ownerSubject,
        requesterSubject,
        status: approve ? 'approved' : 'rejected',
        state: this.snapshotSession(session),
        reason: 'No pending access request',
      }
    }

    session.pendingRequests.delete(requesterSubject)

    if (approve && this.isProjectMember(projectId, requesterSubject)) {
      session.grantedControllerSubject = requesterSubject
      session.activeControllerSubject = requesterSubject
    }

    return {
      ok: true,
      ownerSubject,
      requesterSubject,
      status: approve ? 'approved' : 'rejected',
      state: this.snapshotSession(session),
    }
  }

  revokeControl(projectId: string, ownerSubject: string) {
    const session = this.getExistingSession(projectId, ownerSubject)
    if (!session) {
      return {
        ok: false,
        state: null,
        revokedSubject: null,
        reason: 'Terminal session not found',
      }
    }

    const revokedSubject = session.grantedControllerSubject
    session.grantedControllerSubject = null
    session.activeControllerSubject = ownerSubject
    session.pendingRequests.clear()
    return {
      ok: true,
      state: this.snapshotSession(session),
      revokedSubject,
    }
  }

  async openSession(
    projectId: string,
    ownerSubject: string,
    senderSubject: string,
    onOutput: (ownerSubject: string, chunk: RuntimeOutputChunk) => void,
    initialSize?: RuntimeTerminalSize,
  ): Promise<OperationResult> {
    const session = this.ensureSession(projectId, ownerSubject)
    if (!this.isProjectMember(projectId, senderSubject)) {
      return {
        accepted: false,
        reason: 'Not authorized for this project',
      }
    }

    if (!this.canControlTerminal(session, senderSubject)) {
      return {
        accepted: false,
        reason: 'Terminal is read-only for this user',
      }
    }

    session.emitOutput = onOutput

    try {
      await this.queueSessionOperation(session, async () => {
        await this.reconcileSessionOpenState(session)

        if (session.isSessionOpen) {
          return
        }

        await this.sessionHooks.beforeSessionOpen?.({
          projectId,
          ownerSubject,
        })

        const pendingPrewarm = this.pendingPrewarms.get(terminalKey(projectId, ownerSubject))
        if (pendingPrewarm) {
          await pendingPrewarm
        }

        await session.runtime.openSession(
          {
            cwd: session.cwd,
            projectId,
            ownerSubject,
          },
          (chunk) => {
            session.emitOutput?.(ownerSubject, chunk)
          },
          initialSize,
        )

        session.isSessionOpen = session.runtime.isSessionOpen()

        if (!session.isSessionOpen) {
          throw new Error('Terminal session is not open')
        }

        await this.sessionHooks.afterSessionOpen?.({
          projectId,
          ownerSubject,
        })
      })

      return {
        accepted: true,
      }
    } catch (error) {
      await this.reconcileSessionOpenState(session)
      this.emitRuntimeError(session, error)
      return {
        accepted: false,
        reason: error instanceof Error ? error.message : 'Could not open terminal session',
      }
    }
  }

  async processInput(
    projectId: string,
    ownerSubject: string,
    senderSubject: string,
    input: string,
  ): Promise<OperationResult> {
    const session = this.ensureSession(projectId, ownerSubject)
    if (!this.isProjectMember(projectId, senderSubject)) {
      return {
        accepted: false,
        reason: 'Not authorized for this project',
      }
    }

    if (!this.canControlTerminal(session, senderSubject)) {
      return {
        accepted: false,
        reason: 'Terminal is read-only for this user',
      }
    }

    if (!input) {
      return {
        accepted: false,
        reason: 'Input cannot be empty',
      }
    }

    if (input.length > 4096) {
      return {
        accepted: false,
        reason: 'Terminal input payload is too large',
      }
    }

    await this.reconcileSessionOpenState(session)

    if (!session.isSessionOpen) {
      return {
        accepted: false,
        reason: 'Terminal session is not open',
      }
    }

    try {
      await this.queueSessionOperation(session, async () => {
        await session.runtime.writeInput(input, {
          cwd: session.cwd,
          projectId: session.projectId,
          ownerSubject: session.ownerSubject,
        })
      })

      return {
        accepted: true,
      }
    } catch (error) {
      await this.reconcileSessionOpenState(session)
      this.emitRuntimeError(session, error)
      return {
        accepted: false,
        reason: error instanceof Error ? error.message : 'Could not process terminal input',
      }
    }
  }

  async resizeSession(
    projectId: string,
    ownerSubject: string,
    senderSubject: string,
    size: RuntimeTerminalSize,
  ): Promise<OperationResult> {
    const session = this.ensureSession(projectId, ownerSubject)
    if (!this.isProjectMember(projectId, senderSubject)) {
      return {
        accepted: false,
        reason: 'Not authorized for this project',
      }
    }

    if (!this.canControlTerminal(session, senderSubject)) {
      return {
        accepted: false,
        reason: 'Terminal is read-only for this user',
      }
    }

    if (!Number.isFinite(size.cols) || !Number.isFinite(size.rows) || size.cols < 1 || size.rows < 1) {
      return {
        accepted: false,
        reason: 'Invalid terminal size',
      }
    }

    await this.reconcileSessionOpenState(session)

    if (!session.isSessionOpen) {
      return {
        accepted: false,
        reason: 'Terminal session is not open',
      }
    }

    try {
      await this.queueSessionOperation(session, async () => {
        await session.runtime.resizeSession(size, {
          cwd: session.cwd,
          projectId: session.projectId,
          ownerSubject: session.ownerSubject,
        })
      })

      return {
        accepted: true,
      }
    } catch (error) {
      await this.reconcileSessionOpenState(session)
      this.emitRuntimeError(session, error)
      return {
        accepted: false,
        reason: error instanceof Error ? error.message : 'Could not resize terminal session',
      }
    }
  }

  async closeSession(
    projectId: string,
    ownerSubject: string,
    senderSubject: string,
  ): Promise<OperationResult> {
    const session = this.ensureSession(projectId, ownerSubject)
    if (!this.isProjectMember(projectId, senderSubject)) {
      return {
        accepted: false,
        reason: 'Not authorized for this project',
      }
    }

    if (!this.canControlTerminal(session, senderSubject)) {
      return {
        accepted: false,
        reason: 'Terminal is read-only for this user',
      }
    }

    try {
      await this.queueSessionOperation(session, async () => {
        await this.reconcileSessionOpenState(session)

        if (!session.isSessionOpen) {
          session.emitOutput = null
          return
        }

        await session.runtime.closeSession({
          cwd: session.cwd,
          projectId: session.projectId,
          ownerSubject: session.ownerSubject,
        })

        session.isSessionOpen = false
        session.emitOutput = null

        await this.runAfterSessionCloseHook(session)
      })

      return {
        accepted: true,
      }
    } catch (error) {
      await this.reconcileSessionOpenState(session)
      this.emitRuntimeError(session, error)
      return {
        accepted: false,
        reason: error instanceof Error ? error.message : 'Could not close terminal session',
      }
    }
  }

  private ensureSession(projectId: string, ownerSubject: string): TerminalSession {
    const key = terminalKey(projectId, ownerSubject)
    const existing = this.sessions.get(key)
    if (existing) {
      return existing
    }

    const created: TerminalSession = {
      projectId,
      ownerSubject,
      runtime: this.runtimeFactory({ projectId, ownerSubject }),
      cwd: this.defaultCwdResolver(projectId),
      activeControllerSubject: ownerSubject,
      grantedControllerSubject: null,
      pendingRequests: new Map<string, PendingRequest>(),
      operationChain: Promise.resolve(),
      emitOutput: null,
      isSessionOpen: false,
    }

    this.sessions.set(key, created)
    return created
  }

  private getExistingSession(projectId: string, ownerSubject: string) {
    const key = terminalKey(projectId, ownerSubject)
    return this.sessions.get(key) ?? null
  }

  private snapshotSession(session: TerminalSession): TerminalStateSnapshot {
    return {
      projectId: session.projectId,
      ownerSubject: session.ownerSubject,
      activeControllerSubject: session.activeControllerSubject,
      isSessionOpen: session.isSessionOpen,
      pendingRequests: [...session.pendingRequests.values()].sort((left, right) => {
        return left.requestedAt.localeCompare(right.requestedAt)
      }),
    }
  }
}
