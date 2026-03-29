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
  const originalPs1 = process.env.COLLAB_TERMINAL_PS1

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

    if (originalPs1 === undefined) {
      delete process.env.COLLAB_TERMINAL_PS1
    } else {
      process.env.COLLAB_TERMINAL_PS1 = originalPs1
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
    delete process.env.COLLAB_TERMINAL_PS1

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
      PS1: '$PWD $ ',
    })
  })

  it('reports session open state based on interactive handle', async () => {
    const sandboxManager = new DockerSandboxManagerDouble()
    const runtime = new DockerShellRuntime(
      sandboxManager as never,
      'project-1',
      'owner-1',
    )

    assert.equal(runtime.isSessionOpen(), false)

    await runtime.openSession(
      {
        cwd: '/workspace',
        projectId: 'project-1',
        ownerSubject: 'owner-1',
      },
      () => undefined,
    )

    assert.equal(runtime.isSessionOpen(), true)

    await runtime.closeSession(
      {
        cwd: '/workspace',
        projectId: 'project-1',
        ownerSubject: 'owner-1',
      },
    )

    assert.equal(runtime.isSessionOpen(), false)
  })

  it('marks session closed when interactive write fails with closed-session error', async () => {
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

    ;(runtime as unknown as {
      interactiveSession: { write: () => Promise<void> }
    }).interactiveSession = {
      write: async () => {
        throw new Error('Terminal session is not open')
      },
    }

    await assert.rejects(async () => {
      await runtime.writeInput('echo test\n', {
        cwd: '/workspace',
        projectId: 'project-1',
        ownerSubject: 'owner-1',
      })
    }, /Terminal session is not open/)

    assert.equal(runtime.isSessionOpen(), false)
  })
})
