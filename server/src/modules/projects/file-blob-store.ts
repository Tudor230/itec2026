import { createHash } from 'node:crypto'
import { lstat, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

export interface BlobWriteResult {
  contentHash: string
  byteSize: number
}

export interface FileBlobStore {
  readText(storageKey: string): Promise<string>
  writeText(storageKey: string, content: string): Promise<BlobWriteResult>
  remove(storageKey: string): Promise<void>
}

function asStorageError(code: string, message: string, cause?: unknown) {
  return Object.assign(new Error(message), {
    code,
    cause,
  })
}

function validateStorageKey(storageKey: string) {
  if (!/^[A-Za-z0-9/_-]+$/.test(storageKey)) {
    throw asStorageError('INVALID_STORAGE_KEY', 'Invalid storage key')
  }

  if (storageKey.includes('..') || storageKey.startsWith('/')) {
    throw asStorageError('INVALID_STORAGE_KEY', 'Invalid storage key')
  }
}

async function ensureNoSymlinksToRoot(rootDirectory: string) {
  const originalStats = await lstat(rootDirectory)
  if (originalStats.isSymbolicLink()) {
    throw asStorageError('INVALID_STORAGE_ROOT', 'File storage root cannot be a symbolic link')
  }

  const realRoot = await realpath(rootDirectory)
  const stats = await lstat(realRoot)
  if (!stats.isDirectory()) {
    throw asStorageError('INVALID_STORAGE_ROOT', 'File storage root must be a directory')
  }
}

function toContentHash(content: string) {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

export function createFileStorageKey(projectId: string, fileId: string) {
  return `${projectId}/${fileId}`
}

export class LocalFileBlobStore implements FileBlobStore {
  constructor(private readonly rootDirectory: string) {}

  private resolveStoragePath(storageKey: string) {
    validateStorageKey(storageKey)

    const resolved = path.resolve(this.rootDirectory, storageKey)
    const rootPath = path.resolve(this.rootDirectory)
    if (!resolved.startsWith(`${rootPath}${path.sep}`)) {
      throw asStorageError('INVALID_STORAGE_KEY', 'Invalid storage key')
    }

    return resolved
  }

  async readText(storageKey: string) {
    const storagePath = this.resolveStoragePath(storageKey)

    try {
      const contentBuffer = await readFile(storagePath)
      return contentBuffer.toString('utf8')
    } catch (error) {
      const errorLike = error as NodeJS.ErrnoException
      if (errorLike.code === 'ENOENT') {
        throw asStorageError('FILE_BLOB_NOT_FOUND', 'Stored file blob not found', error)
      }

      throw asStorageError('FILE_BLOB_READ_FAILED', 'Failed to read stored file blob', error)
    }
  }

  async writeText(storageKey: string, content: string) {
    const storagePath = this.resolveStoragePath(storageKey)
    const contentBuffer = Buffer.from(content, 'utf8')

    try {
      await mkdir(path.dirname(storagePath), { recursive: true })
      await writeFile(storagePath, contentBuffer)
      return {
        contentHash: toContentHash(content),
        byteSize: contentBuffer.byteLength,
      } satisfies BlobWriteResult
    } catch (error) {
      throw asStorageError('FILE_BLOB_WRITE_FAILED', 'Failed to write stored file blob', error)
    }
  }

  async remove(storageKey: string) {
    const storagePath = this.resolveStoragePath(storageKey)

    try {
      await rm(storagePath, { force: true })
    } catch (error) {
      throw asStorageError('FILE_BLOB_REMOVE_FAILED', 'Failed to remove stored file blob', error)
    }
  }
}

export function resolveFilesStorageRoot() {
  const configured = process.env.FILES_STORAGE_ROOT?.trim()
  if (configured) {
    return configured
  }

  return path.resolve(process.cwd(), '.data/files')
}

export async function ensureFilesStorageRootExists(rootDirectory: string) {
  await mkdir(rootDirectory, { recursive: true, mode: 0o700 })
  await ensureNoSymlinksToRoot(rootDirectory)
}
