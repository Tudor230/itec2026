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

  private outputDecoder: TextDecoder | null = null

  private emitOutput: ((chunk: RuntimeOutputChunk) => void) | null = null

  isSessionOpen() {
    return this.interactiveSession !== null
  }

  private emitSafely(chunk: RuntimeOutputChunk) {
    try {
      this.emitOutput?.(chunk)
    } catch {
      // Keep terminal runtime stable even if downstream callback throws.
    }
  }

  private markSessionClosed() {
    this.interactiveSession = null
    this.outputDecoder = null
    this.emitOutput = null
  }

  private isSessionClosedError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return message.toLowerCase().includes('terminal session is not open')
  }

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

    this.outputDecoder = new TextDecoder('utf-8')
    this.emitOutput = onOutput

    const env = {
      TERM: process.env.COLLAB_TERMINAL_TERM?.trim() || 'xterm-256color',
      LANG: process.env.COLLAB_TERMINAL_LANG?.trim() || 'C.UTF-8',
      LC_ALL: process.env.COLLAB_TERMINAL_LC_ALL?.trim() || 'C.UTF-8',
      PS1: process.env.COLLAB_TERMINAL_PS1?.trim() || '$PWD $ ',
    }

    try {
      this.interactiveSession = await this.sandboxManager.openInteractiveSession(
        this.projectId,
        this.ownerSubject,
        context.cwd,
        {
          env,
          initialSize,
          onOutput: (chunk) => {
            const decoded = this.outputDecoder
              ? this.outputDecoder.decode(chunk, { stream: true })
              : chunk.toString('utf8')

            if (!decoded) {
              return
            }

            this.emitSafely(makeChunk('stdout', decoded))
          },
        },
      )
    } catch (error) {
      this.outputDecoder = null
      this.emitOutput = null
      throw error
    }
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

    try {
      await this.interactiveSession.write(input)
    } catch (error) {
      if (this.isSessionClosedError(error)) {
        this.markSessionClosed()
      }
      throw error
    }
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

    try {
      await this.interactiveSession.resize(size)
    } catch (error) {
      if (this.isSessionClosedError(error)) {
        this.markSessionClosed()
      }
      throw error
    }
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

    const flushed = this.outputDecoder?.decode() ?? ''
    if (flushed) {
      this.emitSafely(makeChunk('stdout', flushed))
    }

    try {
      await this.interactiveSession.close()
    } catch (error) {
      if (!this.isSessionClosedError(error)) {
        throw error
      }
    } finally {
      this.markSessionClosed()
    }
  }

  dispose() {
    this.markSessionClosed()
    void this.sandboxManager.disposeSandbox(this.projectId, this.ownerSubject)
  }
}
