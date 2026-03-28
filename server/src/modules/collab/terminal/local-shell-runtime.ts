import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import type { RuntimeOutputChunk, RuntimeTerminalSize, TerminalRuntime } from './terminal-runtime.js'

function makeChunk(stream: RuntimeOutputChunk['stream'], chunk: string): RuntimeOutputChunk {
  return {
    stream,
    chunk,
    timestamp: new Date().toISOString(),
  }
}

export class LocalShellRuntime implements TerminalRuntime {
  private shell: ChildProcessWithoutNullStreams | null = null

  private onOutput: ((chunk: RuntimeOutputChunk) => void) | null = null

  async openSession(
    _context: { cwd: string; projectId: string; ownerSubject: string },
    onOutput: (chunk: RuntimeOutputChunk) => void,
    _initialSize?: RuntimeTerminalSize,
  ): Promise<void> {
    if (this.shell) {
      return
    }

    this.onOutput = onOutput

    const shell = process.platform === 'win32'
      ? spawn('powershell.exe', ['-NoProfile'], { cwd: _context.cwd })
      : spawn('/bin/sh', [], { cwd: _context.cwd })

    shell.stdout.on('data', (buffer: Buffer) => {
      this.onOutput?.(makeChunk('stdout', buffer.toString('utf8')))
    })

    shell.stderr.on('data', (buffer: Buffer) => {
      this.onOutput?.(makeChunk('stderr', buffer.toString('utf8')))
    })

    shell.on('error', (error) => {
      this.onOutput?.(makeChunk('stderr', `${error.message}\n`))
    })

    shell.on('close', (code) => {
      this.onOutput?.(makeChunk('system', `\n[exit ${code ?? 0}]\n`))
      this.shell = null
      this.onOutput = null
    })

    this.shell = shell
  }

  async writeInput(
    input: string,
    _context: { cwd: string; projectId: string; ownerSubject: string },
  ): Promise<void> {
    if (!this.shell) {
      throw new Error('Terminal session is not open')
    }

    this.shell.stdin.write(input)
  }

  async resizeSession(
    _size: RuntimeTerminalSize,
    _context: { cwd: string; projectId: string; ownerSubject: string },
  ): Promise<void> {
    return
  }

  async closeSession(_context: { cwd: string; projectId: string; ownerSubject: string }): Promise<void> {
    if (!this.shell) {
      return
    }

    const shell = this.shell
    await new Promise<void>((resolve) => {
      let settled = false
      const finish = () => {
        if (settled) {
          return
        }

        settled = true
        resolve()
      }

      shell.once('close', () => {
        finish()
      })

      try {
        shell.kill('SIGTERM')
      } catch {
        finish()
      }

      setTimeout(() => {
        if (!settled) {
          try {
            shell.kill('SIGKILL')
          } catch {
            // ignore
          }
          finish()
        }
      }, 500)
    })
  }

  dispose() {
    if (this.shell) {
      try {
        this.shell.kill('SIGKILL')
      } catch {
        // ignore
      }
    }

    this.shell = null
    this.onOutput = null
  }
}
