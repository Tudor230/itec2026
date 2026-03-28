import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { DockerShellRuntime } from './docker-shell-runtime.js'

interface InteractiveCallbacks {
  env?: Record<string, string>
  onOutput: (chunk: Buffer) => void
}

class DockerSandboxManagerDouble {
  callbacks: InteractiveCallbacks | null = null

  async ensureSandbox(): Promise<void> {
    return
  }

  async openInteractiveSession(
    _projectId: string,
    _ownerSubject: string,
    _cwd: string,
    callbacks: InteractiveCallbacks,
  ) {
    this.callbacks = callbacks

    return {
      write: async (_input: string) => undefined,
      resize: async (_size: { cols: number; rows: number }) => undefined,
      close: async () => undefined,
    }
  }

  async disposeSandbox(): Promise<void> {
    return
  }
}

describe('docker shell runtime', () => {
  const originalTerm = process.env.COLLAB_TERMINAL_TERM
  const originalLang = process.env.COLLAB_TERMINAL_LANG
  const originalLcAll = process.env.COLLAB_TERMINAL_LC_ALL

  afterEach(() => {
    if (originalTerm === undefined) {
      delete process.env.COLLAB_TERMINAL_TERM
    } else {
      process.env.COLLAB_TERMINAL_TERM = originalTerm
    }

    if (originalLang === undefined) {
      delete process.env.COLLAB_TERMINAL_LANG
    } else {
      process.env.COLLAB_TERMINAL_LANG = originalLang
    }

    if (originalLcAll === undefined) {
      delete process.env.COLLAB_TERMINAL_LC_ALL
    } else {
      process.env.COLLAB_TERMINAL_LC_ALL = originalLcAll
    }
  })

  it('uses streaming decoder for split utf8 chunks', async () => {
    const sandboxManager = new DockerSandboxManagerDouble()
    const runtime = new DockerShellRuntime(
      sandboxManager as never,
      'project-1',
      'owner-1',
    )

    const outputs: string[] = []

    await runtime.openSession(
      {
        cwd: '/workspace',
        projectId: 'project-1',
        ownerSubject: 'owner-1',
      },
      (chunk) => {
        outputs.push(chunk.chunk)
      },
      {
        cols: 120,
        rows: 40,
      },
    )

    assert.ok(sandboxManager.callbacks)

    sandboxManager.callbacks!.onOutput(Buffer.from([0xC3]))
    sandboxManager.callbacks!.onOutput(Buffer.from([0xA9, 0x0A]))

    assert.equal(outputs.join(''), 'é\n')
  })

  it('passes default terminal locale env to interactive exec', async () => {
    delete process.env.COLLAB_TERMINAL_TERM
    delete process.env.COLLAB_TERMINAL_LANG
    delete process.env.COLLAB_TERMINAL_LC_ALL

    const sandboxManager = new DockerSandboxManagerDouble()
    const runtime = new DockerShellRuntime(
      sandboxManager as never,
      'project-1',
      'owner-1',
    )

    await runtime.openSession(
      {
        cwd: '/workspace',
        projectId: 'project-1',
        ownerSubject: 'owner-1',
      },
      () => undefined,
    )

    assert.deepEqual(sandboxManager.callbacks?.env, {
      TERM: 'xterm-256color',
      LANG: 'C.UTF-8',
      LC_ALL: 'C.UTF-8',
    })
  })
})
