import { createHash } from 'node:crypto'
import { chmod, chown, lstat, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

const DEFAULT_EXCLUDED_DIRECTORIES = ['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.cache']

function asWorkspaceError(code: string, message: string, cause?: unknown) {
  return Object.assign(new Error(message), {
    code,
    cause,
  })
}

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

function assertValidProjectId(projectId: string) {
  const trimmed = projectId.trim()
  if (!trimmed) {
    throw asWorkspaceError('INVALID_PROJECT_ID', 'Project id is required')
  }

  if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) {
    throw asWorkspaceError('INVALID_PROJECT_ID', 'Invalid project id')
  }

  return trimmed
}

function isLikelyTextFile(buffer: Buffer) {
  if (buffer.includes(0)) {
    return false
  }

  const content = buffer.toString('utf8')
  return Buffer.from(content, 'utf8').equals(buffer)
}

async function ensureNoSymlinksToRoot(rootDirectory: string) {
  const originalStats = await lstat(rootDirectory)
  if (originalStats.isSymbolicLink()) {
    throw asWorkspaceError('INVALID_WORKSPACE_ROOT', 'Workspace root cannot be a symbolic link')
  }

  const realRoot = await realpath(rootDirectory)
  const stats = await lstat(realRoot)
  if (!stats.isDirectory()) {
    throw asWorkspaceError('INVALID_WORKSPACE_ROOT', 'Workspace root must be a directory')
  }
}

async function resolveWorkspaceRootRealPath(rootDirectory: string) {
  await mkdir(rootDirectory, { recursive: true, mode: 0o700 })
  await ensureNoSymlinksToRoot(rootDirectory)
  return realpath(rootDirectory)
}

export interface WorkspaceTextFile {
  path: string
  content: string
  contentHash: string
  byteSize: number
}

export interface ProjectWorkspaceStore {
  getProjectWorkspacePath(projectId: string): string
  ensureProjectWorkspace(projectId: string): Promise<void>
  writeFile(projectId: string, filePath: string, content: string): Promise<void>
  moveFile(projectId: string, fromPath: string, toPath: string, content: string): Promise<void>
  deleteFile(projectId: string, filePath: string): Promise<void>
  replaceProjectFiles(projectId: string, files: Array<{ path: string; content: string }>): Promise<void>
  listTextFiles(projectId: string): Promise<WorkspaceTextFile[]>
}

export function normalizeProjectFilePath(filePath: string) {
  const trimmed = filePath.trim().replace(/\\+/g, '/')
  const normalized = path.posix.normalize(trimmed)

  if (!normalized || normalized === '.') {
    throw asWorkspaceError('INVALID_WORKSPACE_PATH', 'File path is required')
  }

  if (normalized.startsWith('/') || normalized.startsWith('../') || normalized.includes('/../')) {
    throw asWorkspaceError('INVALID_WORKSPACE_PATH', 'Invalid file path')
  }

  if (normalized.length > 256) {
    throw asWorkspaceError('INVALID_WORKSPACE_PATH', 'File path is too long')
  }

  return normalized
}

export class LocalProjectWorkspaceStore implements ProjectWorkspaceStore {
  private readonly maxSyncFileBytes: number

  private readonly excludedDirectories: Set<string>

  private readonly sandboxUid: number

  private readonly sandboxGid: number

  constructor(
    private readonly rootDirectory: string,
    options?: {
      maxSyncFileBytes?: number
      excludedDirectories?: string[]
    },
  ) {
    this.maxSyncFileBytes = options?.maxSyncFileBytes
      ?? readPositiveInt(process.env.COLLAB_WORKSPACE_MAX_SYNC_FILE_BYTES, 500_000)

    const configuredExcludes = process.env.COLLAB_WORKSPACE_EXCLUDED_DIRS
      ?.split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)

    this.excludedDirectories = new Set(
      options?.excludedDirectories
        ?? configuredExcludes
        ?? DEFAULT_EXCLUDED_DIRECTORIES,
    )

    this.sandboxUid = readPositiveInt(process.env.COLLAB_TERMINAL_DOCKER_UID, 1000)
    this.sandboxGid = readPositiveInt(process.env.COLLAB_TERMINAL_DOCKER_GID, 1000)
  }

  private async applySandboxOwnership(absolutePath: string, isDirectory: boolean) {
    const mode = isDirectory ? 0o770 : 0o660

    try {
      await chmod(absolutePath, mode)
    } catch {
      // Best-effort mode update for cross-platform compatibility.
    }

    try {
      await chown(absolutePath, this.sandboxUid, this.sandboxGid)
    } catch {
      // Best-effort owner update. Some environments may not allow chown.
    }
  }

  private async ensureDirectoryTreeForSandbox(projectId: string, absoluteDirectory: string) {
    const projectRoot = this.getProjectWorkspacePath(projectId)
    const relative = path.relative(projectRoot, absoluteDirectory)
    if (relative.startsWith('..')) {
      throw asWorkspaceError('INVALID_WORKSPACE_PATH', 'Invalid workspace path')
    }

    await mkdir(projectRoot, { recursive: true, mode: 0o770 })
    await this.applySandboxOwnership(projectRoot, true)

    if (!relative || relative === '.') {
      return
    }

    const segments = relative.split(path.sep).filter(Boolean)
    let current = projectRoot
    for (const segment of segments) {
      current = path.resolve(current, segment)
      await mkdir(current, { recursive: true, mode: 0o770 })
      await this.applySandboxOwnership(current, true)
    }
  }

  private async harmonizeWorkspacePermissions(projectId: string) {
    const projectRoot = this.getProjectWorkspacePath(projectId)
    await this.ensureDirectoryTreeForSandbox(projectId, projectRoot)

    const stack = [projectRoot]
    while (stack.length > 0) {
      const directoryPath = stack.pop()
      if (!directoryPath) {
        continue
      }

      const entries = await readdir(directoryPath, { withFileTypes: true })
      await this.applySandboxOwnership(directoryPath, true)

      for (const entry of entries) {
        const entryPath = path.resolve(directoryPath, entry.name)
        if (entry.isSymbolicLink()) {
          continue
        }

        if (entry.isDirectory()) {
          stack.push(entryPath)
          continue
        }

        if (entry.isFile()) {
          await this.applySandboxOwnership(entryPath, false)
        }
      }
    }
  }

  getProjectWorkspacePath(projectId: string) {
    const safeProjectId = assertValidProjectId(projectId)
    return path.resolve(this.rootDirectory, safeProjectId)
  }

  async ensureProjectWorkspace(projectId: string) {
    const projectRoot = this.getProjectWorkspacePath(projectId)
    await mkdir(projectRoot, { recursive: true, mode: 0o770 })
    await this.assertRealPathInsideProjectRoot(projectId, projectRoot)
    await this.harmonizeWorkspacePermissions(projectId)
  }

  private async assertRealPathInsideProjectRoot(projectId: string, absolutePath: string) {
    const projectRoot = this.getProjectWorkspacePath(projectId)
    const rootRealPath = await resolveWorkspaceRootRealPath(projectRoot)
    const targetRealPath = await realpath(absolutePath)

    if (targetRealPath !== rootRealPath && !targetRealPath.startsWith(`${rootRealPath}${path.sep}`)) {
      throw asWorkspaceError('INVALID_WORKSPACE_PATH', 'Path escapes project workspace root')
    }
  }

  private async assertNoSymlinkParentSegments(projectId: string, absolutePath: string) {
    const projectRoot = this.getProjectWorkspacePath(projectId)
    const rootRealPath = await resolveWorkspaceRootRealPath(projectRoot)
    const relativeFromRoot = path.relative(projectRoot, absolutePath)

    if (!relativeFromRoot || relativeFromRoot.startsWith('..')) {
      throw asWorkspaceError('INVALID_WORKSPACE_PATH', 'Invalid workspace path')
    }

    const segments = relativeFromRoot.split(path.sep).filter(Boolean)
    let currentPath = rootRealPath

    for (const segment of segments.slice(0, -1)) {
      currentPath = path.resolve(currentPath, segment)
      const parentStats = await lstat(currentPath).catch(() => null)
      if (parentStats?.isSymbolicLink()) {
        throw asWorkspaceError('INVALID_WORKSPACE_PATH', 'Symlinked parent paths are not allowed')
      }
    }
  }

  private async assertSafeWritePath(projectId: string, absolutePath: string) {
    await this.assertNoSymlinkParentSegments(projectId, absolutePath)
    const currentStats = await lstat(absolutePath).catch(() => null)
    if (currentStats?.isSymbolicLink()) {
      throw asWorkspaceError('INVALID_WORKSPACE_PATH', 'Symlinked file paths are not allowed')
    }
  }

  private resolveProjectFilePath(projectId: string, filePath: string) {
    const projectRoot = this.getProjectWorkspacePath(projectId)
    const normalizedPath = normalizeProjectFilePath(filePath)
    const resolvedPath = path.resolve(projectRoot, normalizedPath)

    if (!resolvedPath.startsWith(`${projectRoot}${path.sep}`)) {
      throw asWorkspaceError('INVALID_WORKSPACE_PATH', 'Invalid file path')
    }

    return {
      projectRoot,
      normalizedPath,
      resolvedPath,
    }
  }

  async writeFile(projectId: string, filePath: string, content: string) {
    const { resolvedPath } = this.resolveProjectFilePath(projectId, filePath)
    await this.assertSafeWritePath(projectId, resolvedPath)
    await this.ensureDirectoryTreeForSandbox(projectId, path.dirname(resolvedPath))
    await this.assertNoSymlinkParentSegments(projectId, resolvedPath)
    await writeFile(resolvedPath, Buffer.from(content, 'utf8'))
    await this.applySandboxOwnership(resolvedPath, false)
    await this.assertRealPathInsideProjectRoot(projectId, resolvedPath)
  }

  async moveFile(projectId: string, fromPath: string, toPath: string, content: string) {
    const fromResolved = this.resolveProjectFilePath(projectId, fromPath)
    const toResolved = this.resolveProjectFilePath(projectId, toPath)

    await this.assertSafeWritePath(projectId, fromResolved.resolvedPath)
    await this.assertSafeWritePath(projectId, toResolved.resolvedPath)

    await this.ensureDirectoryTreeForSandbox(projectId, path.dirname(toResolved.resolvedPath))
    await this.assertNoSymlinkParentSegments(projectId, toResolved.resolvedPath)
    await writeFile(toResolved.resolvedPath, Buffer.from(content, 'utf8'))
    await this.applySandboxOwnership(toResolved.resolvedPath, false)
    await this.assertRealPathInsideProjectRoot(projectId, toResolved.resolvedPath)

    if (fromResolved.normalizedPath !== toResolved.normalizedPath) {
      await rm(fromResolved.resolvedPath, { force: true })
    }
  }

  async deleteFile(projectId: string, filePath: string) {
    const { resolvedPath } = this.resolveProjectFilePath(projectId, filePath)
    await this.assertSafeWritePath(projectId, resolvedPath)
    await rm(resolvedPath, { force: true })
  }

  async replaceProjectFiles(projectId: string, files: Array<{ path: string; content: string }>) {
    const projectRoot = this.getProjectWorkspacePath(projectId)

    await mkdir(projectRoot, { recursive: true, mode: 0o770 })
    await this.assertRealPathInsideProjectRoot(projectId, projectRoot)
    await this.applySandboxOwnership(projectRoot, true)

    const existingEntries = await readdir(projectRoot, { withFileTypes: true })
    for (const entry of existingEntries) {
      const entryPath = path.resolve(projectRoot, entry.name)
      await rm(entryPath, { recursive: true, force: true })
    }

    for (const file of files) {
      const { resolvedPath } = this.resolveProjectFilePath(projectId, file.path)
      await this.assertSafeWritePath(projectId, resolvedPath)
      await this.ensureDirectoryTreeForSandbox(projectId, path.dirname(resolvedPath))
      await this.assertNoSymlinkParentSegments(projectId, resolvedPath)
      await writeFile(resolvedPath, Buffer.from(file.content, 'utf8'))
      await this.applySandboxOwnership(resolvedPath, false)
      await this.assertRealPathInsideProjectRoot(projectId, resolvedPath)
    }
  }

  async listTextFiles(projectId: string): Promise<WorkspaceTextFile[]> {
    const projectRoot = this.getProjectWorkspacePath(projectId)
    await this.ensureProjectWorkspace(projectId)

    const entries: WorkspaceTextFile[] = []
    const stack: Array<{ absoluteDir: string; relativeDir: string }> = [
      {
        absoluteDir: projectRoot,
        relativeDir: '',
      },
    ]

    while (stack.length > 0) {
      const current = stack.pop()
      if (!current) {
        continue
      }

      const children = await readdir(current.absoluteDir, { withFileTypes: true })

      for (const child of children) {
        const relativePath = current.relativeDir
          ? `${current.relativeDir}/${child.name}`
          : child.name
        const absolutePath = path.resolve(current.absoluteDir, child.name)

        if (child.isSymbolicLink()) {
          continue
        }

        if (child.isDirectory()) {
          if (this.excludedDirectories.has(child.name)) {
            continue
          }

          stack.push({
            absoluteDir: absolutePath,
            relativeDir: relativePath,
          })
          continue
        }

        if (!child.isFile()) {
          continue
        }

        const normalizedPath = normalizeProjectFilePath(relativePath)
        const stats = await lstat(absolutePath).catch(() => null)
        if (!stats || !stats.isFile() || stats.isSymbolicLink()) {
          continue
        }

        await this.assertRealPathInsideProjectRoot(projectId, absolutePath)
        const contentBuffer = await readFile(absolutePath)

        if (contentBuffer.byteLength > this.maxSyncFileBytes) {
          continue
        }

        if (!isLikelyTextFile(contentBuffer)) {
          continue
        }

        const content = contentBuffer.toString('utf8')
        entries.push({
          path: normalizedPath,
          content,
          byteSize: contentBuffer.byteLength,
          contentHash: createHash('sha256').update(content, 'utf8').digest('hex'),
        })
      }
    }

    return entries.sort((left, right) => left.path.localeCompare(right.path))
  }
}

export function resolveProjectWorkspaceRoot() {
  const configured = process.env.COLLAB_WORKSPACE_ROOT?.trim()
  if (configured) {
    return configured
  }

  return path.resolve(process.cwd(), '.data/workspaces')
}

export async function ensureProjectWorkspaceRootExists(rootDirectory: string) {
  await mkdir(rootDirectory, { recursive: true, mode: 0o770 })
  await ensureNoSymlinksToRoot(rootDirectory)
}
