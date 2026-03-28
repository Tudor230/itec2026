import type {
  RuntimeOutputChunk,
  RuntimeTerminalSize,
  TerminalRuntime,
} from './terminal-runtime.js'
import {
  DockerSandboxManager,
  type DockerInteractiveSessionHandle,
} from './docker-sandbox-manager.js'

function makeChunk(stream: RuntimeOutputChunk['stream'], chunk: string): RuntimeOutputChunk {
  return {
    stream,
    chunk,
    timestamp: new Date().toISOString(),
  }
}

export class DockerShellRuntime implements TerminalRuntime {
  private interactiveSession: DockerInteractiveSessionHandle | null = null

  constructor(
    private readonly sandboxManager: DockerSandboxManager,
    private readonly projectId: string,
    private readonly ownerSubject: string,
  ) {}

  async prewarm(context: { cwd: string; projectId: string; ownerSubject: string }) {
    if (context.projectId !== this.projectId || context.ownerSubject !== this.ownerSubject) {
      throw Object.assign(new Error('Terminal runtime context mismatch'), {
        code: 'DOCKER_RUNTIME_CONTEXT_INVALID',
      })
    }

    await this.sandboxManager.ensureSandbox(this.projectId, this.ownerSubject)
  }

  async openSession(
    context: { cwd: string; projectId: string; ownerSubject: string },
    onOutput: (chunk: RuntimeOutputChunk) => void,
    initialSize?: RuntimeTerminalSize,
  ): Promise<void> {
    if (context.projectId !== this.projectId || context.ownerSubject !== this.ownerSubject) {
      throw Object.assign(new Error('Terminal runtime context mismatch'), {
        code: 'DOCKER_RUNTIME_CONTEXT_INVALID',
      })
    }

    if (this.interactiveSession) {
      return
    }

    this.interactiveSession = await this.sandboxManager.openInteractiveSession(
      this.projectId,
      this.ownerSubject,
      context.cwd,
      {
        initialSize,
        onOutput: (chunk) => {
          onOutput(makeChunk('stdout', chunk.toString('utf8')))
        },
      },
    )
  }

  async writeInput(
    input: string,
    context: { cwd: string; projectId: string; ownerSubject: string },
  ): Promise<void> {
    if (context.projectId !== this.projectId || context.ownerSubject !== this.ownerSubject) {
      throw Object.assign(new Error('Terminal runtime context mismatch'), {
        code: 'DOCKER_RUNTIME_CONTEXT_INVALID',
      })
    }

    if (!this.interactiveSession) {
      throw new Error('Terminal session is not open')
    }

    await this.interactiveSession.write(input)
  }

  async resizeSession(
    size: RuntimeTerminalSize,
    context: { cwd: string; projectId: string; ownerSubject: string },
  ): Promise<void> {
    if (context.projectId !== this.projectId || context.ownerSubject !== this.ownerSubject) {
      throw Object.assign(new Error('Terminal runtime context mismatch'), {
        code: 'DOCKER_RUNTIME_CONTEXT_INVALID',
      })
    }

    if (!this.interactiveSession) {
      throw new Error('Terminal session is not open')
    }

    await this.interactiveSession.resize(size)
  }

  async closeSession(
    context: { cwd: string; projectId: string; ownerSubject: string },
  ): Promise<void> {
    if (context.projectId !== this.projectId || context.ownerSubject !== this.ownerSubject) {
      throw Object.assign(new Error('Terminal runtime context mismatch'), {
        code: 'DOCKER_RUNTIME_CONTEXT_INVALID',
      })
    }

    if (!this.interactiveSession) {
      return
    }

    await this.interactiveSession.close()
    this.interactiveSession = null
  }

  dispose() {
    this.interactiveSession = null
    void this.sandboxManager.disposeSandbox(this.projectId, this.ownerSubject)
  }
}
