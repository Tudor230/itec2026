import type { PrismaClient } from '@prisma/client'
import type { ActorContext } from '../auth/actor-context.js'
import { createId } from './id.js'
import { createFileStorageKey, type FileBlobStore } from './file-blob-store.js'
import { canEditProject, canReadProject } from './project-access.js'
import type {
  FileImportResult,
  FileInput,
  FileRecord,
  FolderRecord,
  ImportFileInput,
} from './file.types.js'

const MAX_IMPORT_FILE_CONTENT_LENGTH = 500_000

function isSafeRelativePath(path: string): boolean {
  if (!path || path.length > 256) {
    return false
  }

  if (path.startsWith('/') || path.startsWith('\\') || path.includes('..')) {
    return false
  }

  const segments = path.split('/').filter((segment) => segment.trim().length > 0)
  if (segments.length === 0) {
    return false
  }

  return segments.join('/') === path
}

function toImportErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  return fallback
}

function toFileRecord(file: {
  id: string
  projectId: string
  path: string
  storageKey: string
  contentHash: string
  byteSize: number
  ownerSubject: string | null
  createdAt: Date
  updatedAt: Date
}, content: string): FileRecord {
  const createdAt = file.createdAt.toISOString()
  const updatedAt = file.updatedAt.toISOString()

  return {
    id: file.id,
    projectId: file.projectId,
    path: file.path,
    content,
    storageKey: file.storageKey,
    contentHash: file.contentHash,
    byteSize: file.byteSize,
    ownerSubject: file.ownerSubject,
    createdAt,
    updatedAt,
  }
}

export class FilesRepository {
  private readonly virtualFoldersByProjectId = new Map<string, Set<string>>()

  constructor(
    private readonly prisma: PrismaClient,
    private readonly blobStore: FileBlobStore,
  ) {}

  private async createFileInternal(
    projectId: string,
    path: string,
    content: string,
    ownerSubject: string | null,
  ): Promise<FileRecord> {
    const id = createId()
    const storageKey = createFileStorageKey(projectId, id)
    const blobResult = await this.blobStore.writeText(storageKey, content)

    try {
      const file = await this.prisma.file.create({
        data: {
          id,
          projectId,
          path,
          storageKey,
          contentHash: blobResult.contentHash,
          byteSize: blobResult.byteSize,
          ownerSubject,
        },
        select: {
          id: true,
          projectId: true,
          path: true,
          storageKey: true,
          contentHash: true,
          byteSize: true,
          ownerSubject: true,
          createdAt: true,
          updatedAt: true,
        },
      })

      return toFileRecord(file, content)
    } catch (error) {
      await this.blobStore.remove(storageKey)
      throw error
    }
  }

  private async listProjectPaths(projectId: string): Promise<Set<string>> {
    const existing = await this.prisma.file.findMany({
      where: {
        projectId,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    })

    const paths = existing.map((entry) => entry.path)
    return new Set(paths)
  }

  async listByProject(actor: ActorContext, projectId: string): Promise<FileRecord[]> {
    const ownerSubject = actor.subject
    if (!ownerSubject) {
      return []
    }

    const allowed = await canReadProject(this.prisma, actor, projectId)
    if (!allowed) {
      return []
    }

    const files: Array<{
      id: string
      projectId: string
      path: string
      storageKey: string
      contentHash: string
      byteSize: number
      ownerSubject: string | null
      createdAt: Date
      updatedAt: Date
    }> = await this.prisma.file.findMany({
      where: {
        projectId,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    })

    const fileRecords = await Promise.all(files.map(async (file) => {
      try {
        const content = await this.blobStore.readText(file.storageKey)
        return toFileRecord(file, content)
      } catch (error) {
        const errorLike = error as { code?: string }
        if (errorLike.code === 'FILE_BLOB_NOT_FOUND') {
          return null
        }

        throw error
      }
    }))

    return fileRecords.filter((file): file is FileRecord => file !== null)
  }

  async listByProjectForSync(projectId: string): Promise<FileRecord[]> {
    const files: Array<{
      id: string
      projectId: string
      path: string
      storageKey: string
      contentHash: string
      byteSize: number
      ownerSubject: string | null
      createdAt: Date
      updatedAt: Date
    }> = await this.prisma.file.findMany({
      where: {
        projectId,
      },
      orderBy: {
        path: 'asc',
      },
    })

    const fileRecords = await Promise.all(files.map(async (file) => {
      try {
        const content = await this.blobStore.readText(file.storageKey)
        return toFileRecord(file, content)
      } catch (error) {
        const errorLike = error as { code?: string }
        if (errorLike.code === 'FILE_BLOB_NOT_FOUND') {
          return null
        }

        throw error
      }
    }))

    return fileRecords.filter((file): file is FileRecord => file !== null)
  }

  async listFoldersByProject(actor: ActorContext, projectId: string): Promise<FolderRecord[]> {
    const ownerSubject = actor.subject
    if (!ownerSubject) {
      return []
    }

    const allowed = await canReadProject(this.prisma, actor, projectId)
    if (!allowed) {
      return []
    }

    const files: Array<{ path: string }> = await this.prisma.file.findMany({
      where: { projectId },
      select: { path: true },
    })

    const folderPaths = new Set<string>()

    files.forEach((file) => {
      const segments = file.path.split('/').filter((segment) => segment.trim().length > 0)
      if (segments.length <= 1) {
        return
      }

      for (let index = 0; index < segments.length - 1; index += 1) {
        const folderPath = segments.slice(0, index + 1).join('/')
        folderPaths.add(folderPath)
      }
    })

    const persistedFolders = this.virtualFoldersByProjectId.get(projectId)
    if (persistedFolders) {
      persistedFolders.forEach((path) => {
        folderPaths.add(path)
      })
    }

    return [...folderPaths]
      .sort((left, right) => left.localeCompare(right))
      .map((path) => ({ path }))
  }

  async getById(actor: ActorContext, id: string): Promise<FileRecord | null> {
    if (!actor.subject) {
      return null
    }

    const file = await this.prisma.file.findFirst({
      where: {
        id,
      },
      select: {
        id: true,
        projectId: true,
        path: true,
        storageKey: true,
        contentHash: true,
        byteSize: true,
        ownerSubject: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    if (!file) {
      return null
    }

    const allowed = await canReadProject(this.prisma, actor, file.projectId)
    if (!allowed) {
      return null
    }

    const content = await this.blobStore.readText(file.storageKey)
    return toFileRecord(file, content)
  }

  async create(actor: ActorContext, input: FileInput): Promise<FileRecord> {
    const ownerSubject = actor.subject

    if (!ownerSubject) {
      throw Object.assign(new Error('Authentication is required'), {
        code: 'AUTH_REQUIRED',
      })
    }

    const canCreate = await canEditProject(this.prisma, actor, input.projectId)
    if (!canCreate) {
      throw Object.assign(new Error('Project not found'), {
        code: 'P2025',
      })
    }

    return this.createFileInternal(input.projectId, input.path, input.content, ownerSubject)
  }

  async createFromSync(input: FileInput, ownerSubject: string | null = null): Promise<FileRecord> {
    return this.createFileInternal(input.projectId, input.path, input.content, ownerSubject)
  }

  async importFilesSkipDuplicates(
    actor: ActorContext,
    projectId: string,
    files: ImportFileInput[],
  ): Promise<FileImportResult> {
    const ownerSubject = actor.subject
    if (!ownerSubject) {
      throw Object.assign(new Error('Authentication is required'), {
        code: 'AUTH_REQUIRED',
      })
    }

    const canCreate = await canEditProject(this.prisma, actor, projectId)
    if (!canCreate) {
      throw Object.assign(new Error('Project not found'), {
        code: 'P2025',
      })
    }

    const existingPaths = await this.listProjectPaths(projectId)
    const seenImportPaths = new Set<string>()
    const imported: FileRecord[] = []
    const skipped: FileImportResult['skipped'] = []
    const failed: FileImportResult['failed'] = []

    for (const input of files) {
      const normalizedPath = input.path.replaceAll('\\', '/').trim()

      if (!isSafeRelativePath(normalizedPath)) {
        skipped.push({
          path: input.path,
          reason: 'Invalid file path',
        })
        continue
      }

      if (seenImportPaths.has(normalizedPath)) {
        skipped.push({
          path: normalizedPath,
          reason: 'Duplicate file path in import payload',
        })
        continue
      }

      seenImportPaths.add(normalizedPath)

      if (existingPaths.has(normalizedPath)) {
        skipped.push({
          path: normalizedPath,
          reason: 'File already exists',
        })
        continue
      }

      if (input.content.length > MAX_IMPORT_FILE_CONTENT_LENGTH) {
        skipped.push({
          path: normalizedPath,
          reason: 'File exceeds maximum size',
        })
        continue
      }

      try {
        const created = await this.createFileInternal(projectId, normalizedPath, input.content, ownerSubject)
        imported.push(created)
        existingPaths.add(normalizedPath)
      } catch (error) {
        const errorLike = error as { code?: string }
        if (errorLike.code === 'P2002' || errorLike.code === '23505') {
          skipped.push({
            path: normalizedPath,
            reason: 'File already exists',
          })
          existingPaths.add(normalizedPath)
          continue
        }

        failed.push({
          path: normalizedPath,
          reason: toImportErrorMessage(error, 'Could not import file'),
        })
      }
    }

    return {
      imported,
      skipped,
      failed,
    }
  }

  async update(
    actor: ActorContext,
    id: string,
    updates: Partial<Pick<FileInput, 'path' | 'content'>>,
  ): Promise<FileRecord | null> {
    const current = await this.getById(actor, id)
    if (!current) {
      return null
    }

    const canUpdate = await canEditProject(this.prisma, actor, current.projectId)
    if (!canUpdate) {
      return null
    }

    const nextPath = updates.path ?? current.path
    const nextContent = updates.content ?? current.content
    const blobResult = await this.blobStore.writeText(current.storageKey, nextContent)

    try {
      const result = await this.prisma.file.updateMany({
        where: {
          id,
        },
        data: {
          path: nextPath,
          contentHash: blobResult.contentHash,
          byteSize: blobResult.byteSize,
        },
      })

      if (result.count === 0) {
        return null
      }

      return this.getById(actor, id)
    } catch (error) {
      await this.blobStore.writeText(current.storageKey, current.content)
      throw error
    }
  }

  async updateFromSync(
    id: string,
    updates: Partial<Pick<FileInput, 'path' | 'content'>>,
  ): Promise<FileRecord | null> {
    const current = await this.prisma.file.findFirst({
      where: {
        id,
      },
      select: {
        id: true,
        projectId: true,
        path: true,
        storageKey: true,
        contentHash: true,
        byteSize: true,
        ownerSubject: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    if (!current) {
      return null
    }

    const currentContent = await this.blobStore.readText(current.storageKey)
    const nextPath = updates.path ?? current.path
    const nextContent = updates.content ?? currentContent
    const blobResult = await this.blobStore.writeText(current.storageKey, nextContent)

    try {
      const result = await this.prisma.file.updateMany({
        where: {
          id,
        },
        data: {
          path: nextPath,
          contentHash: blobResult.contentHash,
          byteSize: blobResult.byteSize,
        },
      })

      if (result.count === 0) {
        return null
      }

      const refreshed = await this.prisma.file.findFirst({
        where: {
          id,
        },
        select: {
          id: true,
          projectId: true,
          path: true,
          storageKey: true,
          contentHash: true,
          byteSize: true,
          ownerSubject: true,
          createdAt: true,
          updatedAt: true,
        },
      })

      if (!refreshed) {
        return null
      }

      return toFileRecord(refreshed, nextContent)
    } catch (error) {
      await this.blobStore.writeText(current.storageKey, currentContent)
      throw error
    }
  }

  async remove(actor: ActorContext, id: string): Promise<boolean> {
    const current = await this.getById(actor, id)
    if (!current) {
      return false
    }

    const canRemove = await canEditProject(this.prisma, actor, current.projectId)
    if (!canRemove) {
      return false
    }

    const result = await this.prisma.file.deleteMany({
      where: {
        id,
      },
    })

    if (result.count > 0) {
      await this.blobStore.remove(current.storageKey)
    }

    return result.count > 0
  }

  async removeFromSync(id: string): Promise<boolean> {
    const current = await this.prisma.file.findFirst({
      where: {
        id,
      },
      select: {
        id: true,
        storageKey: true,
      },
    })

    if (!current) {
      return false
    }

    const result = await this.prisma.file.deleteMany({
      where: {
        id,
      },
    })

    if (result.count > 0) {
      await this.blobStore.remove(current.storageKey)
    }

    return result.count > 0
  }

  async createFolder(actor: ActorContext, projectId: string, path: string): Promise<FolderRecord> {
    const ownerSubject = actor.subject
    if (!ownerSubject) {
      throw Object.assign(new Error('Authentication is required'), {
        code: 'AUTH_REQUIRED',
      })
    }

    const canCreate = await canEditProject(this.prisma, actor, projectId)
    if (!canCreate) {
      throw Object.assign(new Error('Project not found'), {
        code: 'P2025',
      })
    }

    const current = this.virtualFoldersByProjectId.get(projectId) ?? new Set<string>()
    current.add(path)
    this.virtualFoldersByProjectId.set(projectId, current)

    return { path }
  }

  async renameFolder(actor: ActorContext, projectId: string, fromPath: string, toPath: string): Promise<boolean> {
    const ownerSubject = actor.subject
    if (!ownerSubject) {
      throw Object.assign(new Error('Authentication is required'), {
        code: 'AUTH_REQUIRED',
      })
    }

    const canEdit = await canEditProject(this.prisma, actor, projectId)
    if (!canEdit) {
      return false
    }

    const files = await this.prisma.file.findMany({
      where: { projectId },
      select: {
        id: true,
        path: true,
        contentHash: true,
        byteSize: true,
      },
    })

    const affected = files.filter((file) => isFolderChildPath(file.path, fromPath))
    if (affected.length === 0) {
      const projectFolders = this.virtualFoldersByProjectId.get(projectId)
      if (!projectFolders || !projectFolders.has(fromPath)) {
        return false
      }
    }

    const unaffectedPaths = new Set(
      files.filter((file) => !isFolderChildPath(file.path, fromPath)).map((file) => file.path),
    )

    const renamedPaths = new Set<string>()
    const renamed = affected.map((file) => {
      const nextPath = rewritePathPrefix(file.path, fromPath, toPath)
      if (unaffectedPaths.has(nextPath) || renamedPaths.has(nextPath)) {
        throw Object.assign(new Error('Folder rename conflict'), {
          code: 'P2002',
        })
      }

      renamedPaths.add(nextPath)

      return {
        id: file.id,
        path: nextPath,
        contentHash: file.contentHash,
        byteSize: file.byteSize,
      }
    })

    if (renamed.length > 0) {
      await this.prisma.$transaction(
        renamed.map((item) => {
          return this.prisma.file.updateMany({
            where: { id: item.id },
            data: {
              path: item.path,
              contentHash: item.contentHash,
              byteSize: item.byteSize,
            },
          })
        }),
      )
    }

    const projectFolders = this.virtualFoldersByProjectId.get(projectId)
    if (projectFolders) {
      const nextFolders = new Set<string>()
      projectFolders.forEach((folderPath) => {
        if (folderPath === fromPath) {
          nextFolders.add(toPath)
          return
        }

        if (folderPath.startsWith(`${fromPath}/`)) {
          nextFolders.add(`${toPath}${folderPath.slice(fromPath.length)}`)
          return
        }

        nextFolders.add(folderPath)
      })
      this.virtualFoldersByProjectId.set(projectId, nextFolders)
    }

    return true
  }

  async deleteFolder(actor: ActorContext, projectId: string, path: string): Promise<boolean> {
    const ownerSubject = actor.subject
    if (!ownerSubject) {
      throw Object.assign(new Error('Authentication is required'), {
        code: 'AUTH_REQUIRED',
      })
    }

    const canDelete = await canEditProject(this.prisma, actor, projectId)
    if (!canDelete) {
      return false
    }

    const files = await this.prisma.file.findMany({
      where: { projectId },
      select: {
        id: true,
        path: true,
        storageKey: true,
      },
    })

    const affected = files.filter((file) => isFolderChildPath(file.path, path))
    if (affected.length === 0) {
      const projectFolders = this.virtualFoldersByProjectId.get(projectId)
      if (!projectFolders || !projectFolders.has(path)) {
        return false
      }
    }

    if (affected.length > 0) {
      await this.prisma.$transaction(
        affected.map((file) => {
          return this.prisma.file.deleteMany({ where: { id: file.id } })
        }),
      )

      await Promise.allSettled(affected.map((file) => this.blobStore.remove(file.storageKey)))
    }

    const projectFolders = this.virtualFoldersByProjectId.get(projectId)
    if (projectFolders) {
      const nextFolders = new Set<string>()
      projectFolders.forEach((folderPath) => {
        if (folderPath === path || folderPath.startsWith(`${path}/`)) {
          return
        }

        nextFolders.add(folderPath)
      })
      this.virtualFoldersByProjectId.set(projectId, nextFolders)
    }

    return true
  }
}

function isFolderChildPath(candidatePath: string, basePath: string): boolean {
  return candidatePath.startsWith(`${basePath}/`)
}

function rewritePathPrefix(path: string, fromPath: string, toPath: string): string {
  if (path === fromPath) {
    return toPath
  }

  if (path.startsWith(`${fromPath}/`)) {
    return `${toPath}${path.slice(fromPath.length)}`
  }

  return path
}
