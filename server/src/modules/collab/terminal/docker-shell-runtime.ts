import path from 'node:path'
import type { RuntimeOutputChunk, TerminalRuntime } from './terminal-runtime.js'
import { DockerSandboxManager } from './docker-sandbox-manager.js'

function normalizeContainerPath(input: string, cwd: string) {
  const trimmed = input.trim()
  if (!trimmed) {
    return null
  }

  if (trimmed === '~') {
    return '/workspace'
  }

  if (trimmed.startsWith('~/')) {
    return path.posix.resolve('/workspace', trimmed.slice(2))
  }

  if (trimmed.startsWith('/')) {
    return path.posix.resolve(trimmed)
  }

  return path.posix.resolve(cwd, trimmed)
}

function parseCdCommand(rawCommand: string, cwd: string) {
  const match = rawCommand.match(/^\s*cd\s+(.+)$/i)
  if (!match) {
    return null
  }

  const nextRaw = match[1].trim()
  const unquoted = nextRaw.replace(/^['"]|['"]$/g, '')
  const next = normalizeContainerPath(unquoted, cwd)
  if (!next) {
    return null
  }

  if (next !== '/workspace' && !next.startsWith('/workspace/')) {
    return null
  }

  return next
}

function makeChunk(stream: RuntimeOutputChunk['stream'], chunk: string): RuntimeOutputChunk {
  return {
    stream,
    chunk,
    timestamp: new Date().toISOString(),
  }
}

export class DockerShellRuntime implements TerminalRuntime {
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

  async execute(
    command: string,
    context: { cwd: string; projectId: string; ownerSubject: string },
    onOutput: (chunk: RuntimeOutputChunk) => void,
  ): Promise<{ nextCwd: string }> {
    if (context.projectId !== this.projectId || context.ownerSubject !== this.ownerSubject) {
      throw Object.assign(new Error('Terminal runtime context mismatch'), {
        code: 'DOCKER_RUNTIME_CONTEXT_INVALID',
      })
    }

    const trimmed = command.trim()
    if (!trimmed) {
      return { nextCwd: context.cwd }
    }

    const cdTarget = parseCdCommand(trimmed, context.cwd)
    if (cdTarget) {
      const code = await this.sandboxManager.exec(
        this.projectId,
        this.ownerSubject,
        context.cwd,
        `test -d "$COLLAB_CD_TARGET"`,
        {
          env: {
            COLLAB_CD_TARGET: cdTarget,
          },
          onStdout: () => undefined,
          onStderr: (chunk) => {
            onOutput(makeChunk('stderr', chunk.toString('utf8')))
          },
        },
      )

      if (code !== 0) {
        onOutput(makeChunk('stderr', `cd: no such directory: ${cdTarget}\n`))
        return { nextCwd: context.cwd }
      }

      return {
        nextCwd: cdTarget,
      }
    }

    const exitCode = await this.sandboxManager.exec(
      this.projectId,
      this.ownerSubject,
      context.cwd,
      trimmed,
      {
        onStdout: (chunk) => {
          onOutput(makeChunk('stdout', chunk.toString('utf8')))
        },
        onStderr: (chunk) => {
          onOutput(makeChunk('stderr', chunk.toString('utf8')))
        },
      },
    )

    onOutput(makeChunk('system', `\n[exit ${exitCode}]\n`))

    return {
      nextCwd: context.cwd,
    }
  }

  dispose() {
    void this.sandboxManager.disposeSandbox(this.projectId, this.ownerSubject)
  }
}
