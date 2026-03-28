import { createHash } from 'node:crypto'
import { PassThrough } from 'node:stream'
import Dockerode from 'dockerode'
import type { ProjectWorkspaceStore } from '../../projects/project-workspace-store.js'
import type { RuntimeTerminalSize } from './terminal-runtime.js'
import { DockerTtyOutputParser } from './docker-tty-stream.js'

interface SandboxRef {
  containerName: string
  interactiveSession?: {
    execId: string
    stream: NodeJS.ReadWriteStream
  }
}

interface DockerConnectionOptions {
  socketPath?: string
  host?: string
  port?: number
  protocol?: 'http' | 'https'
}

export interface DockerInteractiveSessionHandle {
  write: (input: string) => Promise<void>
  resize: (size: RuntimeTerminalSize) => Promise<void>
  close: () => Promise<void>
}

type DockerLogLevel = 'silent' | 'error' | 'info' | 'debug'

function readPositiveInt(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback
  }

  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }

  return parsed
}

function readPositiveFloat(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback
  }

  const parsed = Number.parseFloat(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }

  return parsed
}

function resolveLogLevel(raw: string | undefined): DockerLogLevel {
  const normalized = raw?.trim().toLowerCase()
  if (normalized === 'silent' || normalized === 'error' || normalized === 'info' || normalized === 'debug') {
    return normalized
  }

  return 'info'
}

function logLevelWeight(level: DockerLogLevel) {
  if (level === 'silent') {
    return 0
  }

  if (level === 'error') {
    return 1
  }

  if (level === 'info') {
    return 2
  }

  return 3
}

function parseDockerHost(value: string): DockerConnectionOptions {
  if (value.startsWith('unix://')) {
    return {
      socketPath: value.slice('unix://'.length),
    }
  }

  if (value.startsWith('npipe://')) {
    const stripped = value.slice('npipe://'.length)
    const normalized = stripped.startsWith('/') ? stripped : `/${stripped}`
    return {
      socketPath: normalized,
    }
  }

  if (value.startsWith('tcp://')) {
    const useTls = process.env.DOCKER_TLS_VERIFY?.trim() === '1'
    const asHttp = value.replace(/^tcp:\/\//, useTls ? 'https://' : 'http://')
    const parsed = new URL(asHttp)
    return {
      host: parsed.hostname,
      port: parsed.port ? Number.parseInt(parsed.port, 10) : (useTls ? 2376 : 2375),
      protocol: parsed.protocol === 'https:' ? 'https' : 'http',
    }
  }

  if (value.startsWith('http://') || value.startsWith('https://')) {
    const parsed = new URL(value)
    return {
      host: parsed.hostname,
      port: parsed.port ? Number.parseInt(parsed.port, 10) : (parsed.protocol === 'https:' ? 2376 : 2375),
      protocol: parsed.protocol === 'https:' ? 'https' : 'http',
    }
  }

  return {}
}

function resolveDockerConnection(): DockerConnectionOptions {
  const explicitSocket = process.env.COLLAB_DOCKER_SOCKET_PATH?.trim()
  if (explicitSocket) {
    return {
      socketPath: explicitSocket,
    }
  }

  const dockerHost = process.env.DOCKER_HOST?.trim()
  if (dockerHost) {
    const parsed = parseDockerHost(dockerHost)
    if (parsed.socketPath || parsed.host) {
      return parsed
    }
  }

  if (process.platform === 'win32') {
    return {
      socketPath: '//./pipe/docker_engine',
    }
  }

  return {
    socketPath: '/var/run/docker.sock',
  }
}

function parseMemoryBytes(input: string) {
  const trimmed = input.trim().toLowerCase()
  if (!trimmed) {
    return 512 * 1024 * 1024
  }

  const match = trimmed.match(/^(\d+)([kmg])?b?$/)
  if (!match) {
    return 512 * 1024 * 1024
  }

  const value = Number.parseInt(match[1], 10)
  const unit = match[2]
  if (!Number.isFinite(value) || value <= 0) {
    return 512 * 1024 * 1024
  }

  if (unit === 'g') {
    return value * 1024 * 1024 * 1024
  }

  if (unit === 'm') {
    return value * 1024 * 1024
  }

  if (unit === 'k') {
    return value * 1024
  }

  return value
}

function isDockerNotFoundError(error: unknown) {
  const maybeError = error as { statusCode?: number; reason?: string; message?: string }
  if (maybeError.statusCode === 404) {
    return true
  }

  const message = `${maybeError.reason ?? ''} ${maybeError.message ?? ''}`.toLowerCase()
  return message.includes('no such container')
}

function toDockerRuntimeError(error: unknown, fallbackCode: string, fallbackMessage: string) {
  const maybeError = error as {
    code?: string
    statusCode?: number
    reason?: string
    message?: string
  }

  if (maybeError.code === 'ENOENT' || `${maybeError.message ?? ''}`.toLowerCase().includes('enoent')) {
    return Object.assign(new Error('Docker daemon is not reachable. Ensure Docker is running.'), {
      code: 'DOCKER_DAEMON_UNREACHABLE',
      cause: error,
    })
  }

  const imageNotFoundText = `${maybeError.reason ?? ''} ${maybeError.message ?? ''}`.toLowerCase()
  if (maybeError.statusCode === 404 && imageNotFoundText.includes('no such image')) {
    return Object.assign(new Error('Docker image not found. Pull or configure COLLAB_TERMINAL_DOCKER_IMAGE.'), {
      code: 'DOCKER_IMAGE_NOT_FOUND',
      cause: error,
    })
  }

  if (maybeError.statusCode === 403) {
    return Object.assign(new Error('Docker permission denied for current server user.'), {
      code: 'DOCKER_PERMISSION_DENIED',
      cause: error,
    })
  }

  return Object.assign(new Error(fallbackMessage), {
    code: fallbackCode,
    cause: error,
  })
}

function describeError(error: unknown) {
  const maybeError = error as {
    code?: string
    statusCode?: number
    reason?: string
    message?: string
  }

  return {
    code: maybeError.code,
    statusCode: maybeError.statusCode,
    reason: maybeError.reason,
    message: maybeError.message ?? (error instanceof Error ? error.message : String(error)),
  }
}

function isDockerDaemonError(error: unknown) {
  const maybeError = error as {
    code?: string
    errno?: string
    statusCode?: number
    message?: string
  }

  if (maybeError.code === 'ENOENT' || maybeError.code === 'ECONNREFUSED') {
    return true
  }

  if (maybeError.errno === 'ENOENT' || maybeError.errno === 'ECONNREFUSED') {
    return true
  }

  const message = `${maybeError.message ?? ''}`.toLowerCase()
  return message.includes('enoent')
    || message.includes('connect econnrefused')
    || message.includes('is the docker daemon running')
}

function isImageNotFoundError(error: unknown) {
  const maybeError = error as {
    statusCode?: number
    reason?: string
    message?: string
  }

  const message = `${maybeError.reason ?? ''} ${maybeError.message ?? ''}`.toLowerCase()
  if (message.includes('no such image')) {
    return true
  }

  if (message.includes('pull access denied')) {
    return true
  }

  return maybeError.statusCode === 404 && message.includes('image')
}

function createContainerName(projectId: string, ownerSubject: string) {
  const digest = createHash('sha1').update(`${projectId}:${ownerSubject}`).digest('hex').slice(0, 16)
  return `itec-terminal-${digest}`
}

export class DockerSandboxManager {
  private readonly sandboxes = new Map<string, SandboxRef>()

  private readonly pendingEnsures = new Map<string, Promise<SandboxRef>>()

  private readonly pendingImagePulls = new Map<string, Promise<void>>()

  private readonly docker: Dockerode

  private readonly image: string

  private readonly cpuLimit: string

  private readonly memoryLimit: string

  private readonly pidsLimit: number

  private readonly logLevel: DockerLogLevel

  private readonly autoPullImage: boolean

  private readonly sandboxUser: string

  constructor(
    private readonly workspaceStore: ProjectWorkspaceStore,
    options?: {
      docker?: Dockerode
      image?: string
      cpuLimit?: string
      memoryLimit?: string
      pidsLimit?: number
    },
  ) {
    const connection = resolveDockerConnection()
    this.docker = options?.docker ?? new Dockerode(connection)
    this.image = options?.image ?? process.env.COLLAB_TERMINAL_DOCKER_IMAGE ?? 'node:20-alpine'
    this.cpuLimit = options?.cpuLimit ?? process.env.COLLAB_TERMINAL_DOCKER_CPU ?? '1.0'
    this.memoryLimit = options?.memoryLimit ?? process.env.COLLAB_TERMINAL_DOCKER_MEMORY ?? '512m'
    this.pidsLimit = options?.pidsLimit ?? readPositiveInt(process.env.COLLAB_TERMINAL_DOCKER_PIDS_LIMIT, 128)
    this.logLevel = resolveLogLevel(process.env.COLLAB_DOCKER_LOG_LEVEL)
    this.autoPullImage = (process.env.COLLAB_TERMINAL_DOCKER_AUTO_PULL?.trim().toLowerCase() ?? 'true') !== 'false'
    const sandboxUid = readPositiveInt(process.env.COLLAB_TERMINAL_DOCKER_UID, 1000)
    const sandboxGid = readPositiveInt(process.env.COLLAB_TERMINAL_DOCKER_GID, 1000)
    this.sandboxUser = `${sandboxUid}:${sandboxGid}`

    this.logInfo('dockerode initialized', {
      socketPath: connection.socketPath,
      host: connection.host,
      port: connection.port,
      protocol: connection.protocol,
      image: this.image,
      autoPullImage: this.autoPullImage,
      sandboxUser: this.sandboxUser,
    })
  }

  private shouldLog(level: Exclude<DockerLogLevel, 'silent'>) {
    return logLevelWeight(this.logLevel) >= logLevelWeight(level)
  }

  private logInfo(message: string, details?: Record<string, unknown>) {
    if (!this.shouldLog('info')) {
      return
    }

    if (details) {
      console.info(`[docker-sandbox] ${message}`, details)
      return
    }

    console.info(`[docker-sandbox] ${message}`)
  }

  private logDebug(message: string, details?: Record<string, unknown>) {
    if (!this.shouldLog('debug')) {
      return
    }

    if (details) {
      console.debug(`[docker-sandbox] ${message}`, details)
      return
    }

    console.debug(`[docker-sandbox] ${message}`)
  }

  private logError(message: string, details?: Record<string, unknown>) {
    if (!this.shouldLog('error')) {
      return
    }

    if (details) {
      console.error(`[docker-sandbox] ${message}`, details)
      return
    }

    console.error(`[docker-sandbox] ${message}`)
  }

  private sandboxKey(projectId: string, ownerSubject: string) {
    return `${projectId}::${ownerSubject}`
  }

  async ensureSandbox(projectId: string, ownerSubject: string): Promise<SandboxRef> {
    const key = this.sandboxKey(projectId, ownerSubject)
    const pending = this.pendingEnsures.get(key)
    if (pending) {
      this.logDebug('reusing in-flight sandbox ensure', {
        projectId,
        ownerSubject,
      })
      return pending
    }

    const ensurePromise = this.ensureSandboxInternal(projectId, ownerSubject)
      .finally(() => {
        this.pendingEnsures.delete(key)
      })

    this.pendingEnsures.set(key, ensurePromise)
    return ensurePromise
  }

  async ping() {
    try {
      await this.docker.ping()
      this.logInfo('docker daemon ping success')
      return true
    } catch (error) {
      this.logError('docker daemon ping failed', describeError(error))
      if (isDockerDaemonError(error)) {
        return false
      }

      return false
    }
  }

  private async ensureImageAvailable() {
    try {
      await this.docker.getImage(this.image).inspect()
      return
    } catch (error) {
      if (!isImageNotFoundError(error)) {
        throw error
      }
    }

    if (!this.autoPullImage) {
      throw Object.assign(new Error('Docker image not found. Auto-pull is disabled.'), {
        code: 'DOCKER_IMAGE_NOT_FOUND',
      })
    }

    const pending = this.pendingImagePulls.get(this.image)
    if (pending) {
      await pending
      return
    }

    const pullPromise = this.pullImage(this.image).finally(() => {
      this.pendingImagePulls.delete(this.image)
    })

    this.pendingImagePulls.set(this.image, pullPromise)
    await pullPromise
  }

  private async pullImage(image: string) {
    this.logInfo('pulling docker image', { image })

    const stream = await this.docker.pull(image)
    await new Promise<void>((resolve, reject) => {
      this.docker.modem.followProgress(stream, (error) => {
        if (error) {
          reject(error)
          return
        }

        resolve()
      })
    })

    this.logInfo('docker image pull complete', { image })
  }

  private async ensureSandboxInternal(projectId: string, ownerSubject: string): Promise<SandboxRef> {
    const key = this.sandboxKey(projectId, ownerSubject)
    const existing = this.sandboxes.get(key)

    if (existing) {
      const alive = await this.isRunning(existing.containerName)
      if (alive) {
        this.logDebug('reusing running sandbox', {
          projectId,
          ownerSubject,
          containerName: existing.containerName,
        })
        return existing
      }

      this.sandboxes.delete(key)
    }

    await this.workspaceStore.ensureProjectWorkspace(projectId)
    const workspacePath = this.workspaceStore.getProjectWorkspacePath(projectId)
    const containerName = createContainerName(projectId, ownerSubject)

    this.logInfo('creating sandbox', {
      projectId,
      ownerSubject,
      containerName,
      workspacePath,
    })

    try {
      await this.ensureImageAvailable()
    } catch (error) {
      this.logError('docker image ensure failed', {
        projectId,
        ownerSubject,
        image: this.image,
        ...describeError(error),
      })

      throw toDockerRuntimeError(error, 'DOCKER_IMAGE_NOT_FOUND', 'Docker image is not available')
    }

    await this.removeContainerIfExists(containerName)

    try {
      const container = await this.docker.createContainer({
        name: containerName,
        Image: this.image,
        Cmd: ['sh', '-lc', 'while true; do sleep 3600; done'],
        WorkingDir: '/workspace',
        User: this.sandboxUser,
        AttachStdin: false,
        AttachStdout: false,
        AttachStderr: false,
        Tty: false,
        HostConfig: {
          NetworkMode: 'none',
          ReadonlyRootfs: true,
          Tmpfs: {
            '/tmp': 'rw,noexec,nosuid,size=64m',
          },
          CapDrop: ['ALL'],
          SecurityOpt: ['no-new-privileges'],
          CpuQuota: Math.round(readPositiveFloat(this.cpuLimit, 1) * 100_000),
          CpuPeriod: 100_000,
          Memory: parseMemoryBytes(this.memoryLimit),
          PidsLimit: this.pidsLimit,
          Mounts: [
            {
              Type: 'bind',
              Source: workspacePath,
              Target: '/workspace',
              ReadOnly: false,
            },
          ],
        },
      })

      await container.start()
      this.logInfo('sandbox started', {
        projectId,
        ownerSubject,
        containerName,
      })
    } catch (error) {
      this.logError('sandbox start failed', {
        projectId,
        ownerSubject,
        containerName,
        ...describeError(error),
      })
      throw toDockerRuntimeError(error, 'DOCKER_SANDBOX_START_FAILED', 'Could not start docker sandbox')
    }

    const created: SandboxRef = {
      containerName,
    }

    this.sandboxes.set(key, created)
    return created
  }

  async disposeSandbox(projectId: string, ownerSubject: string) {
    const key = this.sandboxKey(projectId, ownerSubject)
    const existing = this.sandboxes.get(key)
    if (!existing) {
      return
    }

    await this.closeInteractiveSession(projectId, ownerSubject)
    this.sandboxes.delete(key)
    this.logInfo('disposing sandbox', {
      projectId,
      ownerSubject,
      containerName: existing.containerName,
    })
    await this.removeContainerIfExists(existing.containerName)
  }

  async exec(
    projectId: string,
    ownerSubject: string,
    cwd: string,
    command: string,
    callbacks: {
      env?: Record<string, string>
      onStdout: (chunk: Buffer) => void
      onStderr: (chunk: Buffer) => void
      timeoutMs?: number
    },
  ): Promise<number> {
    const key = this.sandboxKey(projectId, ownerSubject)
    const sandbox = await this.ensureSandbox(projectId, ownerSubject)
    const timeoutMs = callbacks.timeoutMs ?? readPositiveInt(process.env.COLLAB_TERMINAL_COMMAND_TIMEOUT_MS, 120_000)

    this.logDebug('starting docker exec', {
      projectId,
      ownerSubject,
      containerName: sandbox.containerName,
      cwd,
      timeoutMs,
      commandLength: command.length,
    })

    try {
      if (sandbox.interactiveSession) {
        throw Object.assign(new Error('Interactive terminal session is active'), {
          code: 'DOCKER_INTERACTIVE_SESSION_ACTIVE',
        })
      }

      const container = this.docker.getContainer(sandbox.containerName)
      const execInstance = await container.exec({
        Cmd: ['sh', '-lc', command],
        AttachStdout: true,
        AttachStderr: true,
        Env: Object.entries(callbacks.env ?? {}).map(([key, value]) => `${key}=${value}`),
        WorkingDir: cwd,
        Tty: false,
      })

      const stream = await execInstance.start({
        hijack: false,
        stdin: false,
      })

      const stdout = new PassThrough()
      const stderr = new PassThrough()

      stdout.on('data', (chunk: Buffer) => {
        callbacks.onStdout(chunk)
      })

      stderr.on('data', (chunk: Buffer) => {
        callbacks.onStderr(chunk)
      })

      this.docker.modem.demuxStream(stream, stdout, stderr)

      const timeoutError = Object.assign(
        new Error(`Terminal command timed out after ${timeoutMs}ms`),
        { code: 'DOCKER_EXEC_TIMEOUT' },
      )

      let timedOut = false
      let timeout: NodeJS.Timeout | null = null
      if (timeoutMs > 0) {
        timeout = setTimeout(() => {
          timedOut = true
          try {
            stream.destroy(timeoutError)
          } catch {
            // ignore destroy failures
          }
        }, timeoutMs)
      }

      try {
        await new Promise<void>((resolve, reject) => {
          stream.once('end', resolve)
          stream.once('close', resolve)
          stream.once('error', reject)
        })
      } catch (error) {
        if (!timedOut) {
          throw error
        }
      } finally {
        if (timeout) {
          clearTimeout(timeout)
        }
      }

      if (timedOut) {
        this.sandboxes.delete(key)
        this.logError('docker exec timed out, recycling sandbox', {
          projectId,
          ownerSubject,
          containerName: sandbox.containerName,
          timeoutMs,
        })
        await this.removeContainerIfExists(sandbox.containerName)
        throw timeoutError
      }

      const inspected = await execInstance.inspect()
      this.logDebug('docker exec completed', {
        projectId,
        ownerSubject,
        containerName: sandbox.containerName,
        exitCode: inspected.ExitCode ?? 1,
      })
      return inspected.ExitCode ?? 1
    } catch (error) {
      if ((error as { code?: string }).code === 'DOCKER_EXEC_TIMEOUT') {
        throw error
      }

      this.logError('docker exec failed', {
        projectId,
        ownerSubject,
        containerName: sandbox.containerName,
        ...describeError(error),
      })

      throw toDockerRuntimeError(error, 'DOCKER_EXEC_FAILED', 'Could not execute terminal command')
    }
  }

  async openInteractiveSession(
    projectId: string,
    ownerSubject: string,
    cwd: string,
    callbacks: {
      env?: Record<string, string>
      onOutput: (chunk: Buffer) => void
      initialSize?: RuntimeTerminalSize
    },
  ): Promise<DockerInteractiveSessionHandle> {
    const sandbox = await this.ensureSandbox(projectId, ownerSubject)
    const key = this.sandboxKey(projectId, ownerSubject)

    if (sandbox.interactiveSession) {
      throw Object.assign(new Error('Terminal session is already open'), {
        code: 'DOCKER_INTERACTIVE_SESSION_EXISTS',
      })
    }

    this.logDebug('starting docker interactive exec', {
      projectId,
      ownerSubject,
      containerName: sandbox.containerName,
      cwd,
      cols: callbacks.initialSize?.cols,
      rows: callbacks.initialSize?.rows,
    })

    try {
      const container = this.docker.getContainer(sandbox.containerName)
      const execInstance = await container.exec({
        Cmd: ['sh'],
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Env: Object.entries(callbacks.env ?? {}).map(([key, value]) => `${key}=${value}`),
        WorkingDir: cwd,
        Tty: true,
      })

      const stream = await execInstance.start({
        hijack: true,
        stdin: true,
      })
      const outputParser = new DockerTtyOutputParser()

      const execInfo = await execInstance.inspect()
      const execId = (execInstance as { id?: string }).id
        ?? (execInfo as { ID?: string; Id?: string }).ID
        ?? (execInfo as { ID?: string; Id?: string }).Id
      if (!execId) {
        stream.destroy()
        throw new Error('Docker interactive exec id missing')
      }

      stream.on('data', (chunk: Buffer) => {
        const payloads = outputParser.consume(chunk)
        payloads.forEach((payload) => {
          callbacks.onOutput(payload)
        })
      })

      stream.on('close', () => {
        const trailing = outputParser.flush()
        trailing.forEach((payload) => {
          callbacks.onOutput(payload)
        })

        const current = this.sandboxes.get(key)
        if (!current || current.interactiveSession?.execId !== execId) {
          return
        }

        this.sandboxes.set(key, {
          ...current,
          interactiveSession: undefined,
        })
      })

      this.sandboxes.set(key, {
        ...sandbox,
        interactiveSession: {
          execId,
          stream,
        },
      })

      if (callbacks.initialSize) {
        try {
          await execInstance.resize({
            h: Math.max(1, Math.floor(callbacks.initialSize.rows)),
            w: Math.max(1, Math.floor(callbacks.initialSize.cols)),
          })
        } catch {
          // Ignore resize failures for environments that do not support it.
        }
      }

      return {
        write: async (input: string) => {
          const current = this.sandboxes.get(key)
          if (!current?.interactiveSession || current.interactiveSession.execId !== execId) {
            throw new Error('Terminal session is not open')
          }

          await new Promise<void>((resolve, reject) => {
            try {
              const writable = current.interactiveSession!.stream as NodeJS.WritableStream
              const onError = (error: unknown) => {
                cleanup()
                reject(error)
              }
              const onDrain = () => {
                cleanup()
                resolve()
              }
              const cleanup = () => {
                current.interactiveSession?.stream.off('error', onError)
                current.interactiveSession?.stream.off('drain', onDrain)
              }

              current.interactiveSession!.stream.once('error', onError)
              const flushed = writable.write(input)
              if (flushed) {
                cleanup()
                resolve()
                return
              }

              current.interactiveSession!.stream.once('drain', onDrain)
            } catch (error) {
              reject(error)
            }
          })
        },
        resize: async (size: RuntimeTerminalSize) => {
          const current = this.sandboxes.get(key)
          if (!current?.interactiveSession || current.interactiveSession.execId !== execId) {
            throw new Error('Terminal session is not open')
          }

          const exec = this.docker.getExec(execId)
          await exec.resize({
            h: Math.max(1, Math.floor(size.rows)),
            w: Math.max(1, Math.floor(size.cols)),
          })
        },
        close: async () => {
          const current = this.sandboxes.get(key)
          if (!current?.interactiveSession || current.interactiveSession.execId !== execId) {
            return
          }

          await this.closeInteractiveSession(projectId, ownerSubject)
        },
      }
    } catch (error) {
      this.logError('docker interactive exec failed', {
        projectId,
        ownerSubject,
        containerName: sandbox.containerName,
        ...describeError(error),
      })

      throw toDockerRuntimeError(error, 'DOCKER_INTERACTIVE_EXEC_FAILED', 'Could not open interactive terminal session')
    }
  }

  async closeInteractiveSession(projectId: string, ownerSubject: string): Promise<void> {
    const key = this.sandboxKey(projectId, ownerSubject)
    const sandbox = this.sandboxes.get(key)
    if (!sandbox?.interactiveSession) {
      return
    }

    const { stream, execId } = sandbox.interactiveSession
    this.logDebug('closing docker interactive exec', {
      projectId,
      ownerSubject,
      containerName: sandbox.containerName,
      execId,
    })

    await new Promise<void>((resolve) => {
      let settled = false
      const done = () => {
        if (settled) {
          return
        }

        settled = true
        resolve()
      }

      stream.once('close', done)

      try {
        stream.end()
      } catch {
        done()
      }

      setTimeout(() => {
        if (!settled) {
          try {
            ;(stream as NodeJS.ReadWriteStream & { destroy: () => void }).destroy()
          } catch {
            // ignore
          }
          done()
        }
      }, 250)
    })

    const current = this.sandboxes.get(key)
    if (!current) {
      return
    }

    this.sandboxes.set(key, {
      ...current,
      interactiveSession: undefined,
    })
  }

  private async isRunning(containerName: string) {
    try {
      const container = this.docker.getContainer(containerName)
      const inspect = await container.inspect()
      return Boolean(inspect.State?.Running)
    } catch (error) {
      if (isDockerNotFoundError(error)) {
        return false
      }

      this.logError('sandbox inspect failed', {
        containerName,
        ...describeError(error),
      })

      throw toDockerRuntimeError(error, 'DOCKER_SANDBOX_INSPECT_FAILED', 'Could not inspect docker sandbox')
    }
  }

  private async removeContainerIfExists(containerName: string) {
    try {
      const container = this.docker.getContainer(containerName)
      await container.remove({ force: true })
      this.logDebug('removed sandbox container', {
        containerName,
      })
    } catch (error) {
      if (isDockerNotFoundError(error)) {
        return
      }

      this.logError('sandbox remove failed', {
        containerName,
        ...describeError(error),
      })

      throw toDockerRuntimeError(error, 'DOCKER_SANDBOX_REMOVE_FAILED', 'Could not remove existing docker sandbox')
    }
  }
}
