import { spawn } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'
import type { RuntimeOutputChunk, TerminalRuntime } from './terminal-runtime.js'

function normalizePath(input: string, cwd: string) {
  const trimmed = input.trim()
  if (!trimmed) {
    return null
  }

  if (trimmed === '~') {
    return process.env.HOME ?? process.env.USERPROFILE ?? process.cwd()
  }

  if (trimmed.startsWith('~/')) {
    const home = process.env.HOME ?? process.env.USERPROFILE ?? process.cwd()
    return resolve(home, trimmed.slice(2))
  }

  if (isAbsolute(trimmed)) {
    return resolve(trimmed)
  }

  return resolve(cwd, trimmed)
}

function parseCdCommand(rawCommand: string, cwd: string) {
  const match = rawCommand.match(/^\s*cd\s+(.+)$/i)
  if (!match) {
    return null
  }

  const nextRaw = match[1].trim()
  const unquoted = nextRaw.replace(/^['"]|['"]$/g, '')
  const next = normalizePath(unquoted, cwd)
  if (!next) {
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

async function directoryExists(path: string) {
  try {
    const stats = await stat(path)
    return stats.isDirectory()
  } catch {
    return false
  }
}

export class LocalShellRuntime implements TerminalRuntime {
  async execute(
    command: string,
    context: { cwd: string },
    onOutput: (chunk: RuntimeOutputChunk) => void,
  ): Promise<{ nextCwd: string }> {
    const trimmed = command.trim()
    if (!trimmed) {
      return { nextCwd: context.cwd }
    }

    const cdTarget = parseCdCommand(trimmed, context.cwd)
    if (cdTarget) {
      const exists = await directoryExists(cdTarget)
      if (!exists) {
        onOutput(makeChunk('stderr', `cd: no such directory: ${cdTarget}\n`))
        return { nextCwd: context.cwd }
      }

      return {
        nextCwd: cdTarget,
      }
    }

    return new Promise<{ nextCwd: string }>((resolve) => {
      const shell = process.platform === 'win32'
        ? spawn('powershell.exe', ['-NoProfile', '-Command', trimmed], {
            cwd: context.cwd,
          })
        : spawn('/bin/sh', ['-lc', trimmed], {
            cwd: context.cwd,
          })

      shell.stdout.on('data', (buffer: Buffer) => {
        onOutput(makeChunk('stdout', buffer.toString('utf8')))
      })

      shell.stderr.on('data', (buffer: Buffer) => {
        onOutput(makeChunk('stderr', buffer.toString('utf8')))
      })

      shell.on('error', (error) => {
        onOutput(makeChunk('stderr', `${error.message}\n`))
      })

      shell.on('close', (code) => {
        onOutput(makeChunk('system', `\n[exit ${code ?? 0}]\n`))
        resolve({ nextCwd: context.cwd })
      })
    })
  }

  dispose() {}
}
