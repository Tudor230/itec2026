import type { RuntimeOutputChunk, TerminalRuntime } from './terminal-runtime.js'

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
  pendingRequests: Map<string, PendingRequest>
  commandChain: Promise<void>
  hydrated: boolean
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

interface InputResult {
  accepted: boolean
  reason?: string
}

interface RuntimeFactoryInput {
  projectId: string
  ownerSubject: string
}

interface ProcessInputHooks {
  beforeCommand?: (args: { projectId: string; ownerSubject: string }) => Promise<void>
  afterCommand?: (args: { projectId: string; ownerSubject: string }) => Promise<void>
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

  private readonly processInputHooks: ProcessInputHooks

  private readonly defaultCwdResolver: (projectId: string) => string

  private readonly pendingPrewarms = new Map<string, Promise<void>>()

  constructor(
    runtimeFactory: (input: RuntimeFactoryInput) => TerminalRuntime,
    processInputHooks?: ProcessInputHooks,
    options?: TerminalSessionManagerOptions,
  ) {
    this.runtimeFactory = runtimeFactory
    this.processInputHooks = processInputHooks ?? {}
    this.defaultCwdResolver = options?.resolveDefaultCwd ?? ((projectId) => this.resolveDefaultCwd(projectId))
  }

  private resolveDefaultCwd(projectId: string) {
    const workspaceRoot = process.env.COLLAB_TERMINAL_WORKSPACE_ROOT
    if (workspaceRoot && workspaceRoot.trim()) {
      return `${workspaceRoot.replace(/[\\/]+$/, '')}/${projectId}`
    }

    return process.cwd()
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
      if (!session.hydrated) {
        await this.processInputHooks.beforeCommand?.({
          projectId,
          ownerSubject,
        })
        session.hydrated = true
      }

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
      if (candidate.activeControllerSubject === subject) {
        candidate.activeControllerSubject = candidate.ownerSubject
      }
    })

    const key = terminalKey(projectId, subject)
    this.pendingPrewarms.delete(key)
    const session = this.sessions.get(key)
    if (!session) {
      return
    }

    session.runtime.dispose()
    this.sessions.delete(key)
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

    const session = this.ensureSession(projectId, ownerSubject)
    return {
      created: true,
      state: this.snapshotSession(session),
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
    if (session.activeControllerSubject === requesterSubject) {
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

    const revokedSubject = session.activeControllerSubject === ownerSubject
      ? null
      : session.activeControllerSubject
    session.activeControllerSubject = ownerSubject
    session.pendingRequests.clear()
    return {
      ok: true,
      state: this.snapshotSession(session),
      revokedSubject,
    }
  }

  async processInput(
    projectId: string,
    ownerSubject: string,
    senderSubject: string,
    command: string,
    onOutput: (ownerSubject: string, chunk: RuntimeOutputChunk) => void,
  ): Promise<InputResult> {
    const session = this.ensureSession(projectId, ownerSubject)
    const key = terminalKey(projectId, ownerSubject)
    if (!this.isProjectMember(projectId, senderSubject)) {
      return {
        accepted: false,
        reason: 'Not authorized for this project',
      }
    }

    if (session.activeControllerSubject !== senderSubject) {
      return {
        accepted: false,
        reason: 'Terminal is read-only for this user',
      }
    }

    const trimmed = command.trim()
    if (!trimmed) {
      return {
        accepted: false,
        reason: 'Command cannot be empty',
      }
    }

    if (trimmed.length > 1200) {
      return {
        accepted: false,
        reason: 'Command payload is too large',
      }
    }

    session.commandChain = session.commandChain.then(async () => {
      const pendingPrewarm = this.pendingPrewarms.get(key)
      if (pendingPrewarm) {
        await pendingPrewarm
      }

      if (!session.hydrated) {
        await this.processInputHooks.beforeCommand?.({
          projectId,
          ownerSubject,
        })
        session.hydrated = true
      }

      const prompt = `\n$ ${trimmed}\n`
      onOutput(ownerSubject, {
        stream: 'system',
        chunk: prompt,
        timestamp: new Date().toISOString(),
      })

      try {
        const result = await session.runtime.execute(trimmed, {
          cwd: session.cwd,
          projectId: session.projectId,
          ownerSubject: session.ownerSubject,
        }, (chunk) => {
          onOutput(ownerSubject, chunk)
        })

        session.cwd = result.nextCwd
      } finally {
        await this.processInputHooks.afterCommand?.({
          projectId,
          ownerSubject,
        })
      }
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Unknown terminal runtime error'
      onOutput(ownerSubject, {
        stream: 'stderr',
        chunk: `${message}\n`,
        timestamp: new Date().toISOString(),
      })
    })

    return {
      accepted: true,
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
      pendingRequests: new Map<string, PendingRequest>(),
      commandChain: Promise.resolve(),
      hydrated: false,
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
      pendingRequests: [...session.pendingRequests.values()].sort((left, right) => {
        return left.requestedAt.localeCompare(right.requestedAt)
      }),
    }
  }
}
