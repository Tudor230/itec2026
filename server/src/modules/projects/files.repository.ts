import type { PrismaClient } from '@prisma/client'
import type { ActorContext } from '../auth/actor-context.js'
import { createId } from './id.js'
import { createFileStorageKey, type FileBlobStore } from './file-blob-store.js'
import { canEditProject, canReadProject } from './project-access.js'
import type { FileInput, FileRecord } from './file.types.js'

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
  constructor(
    private readonly prisma: PrismaClient,
    private readonly blobStore: FileBlobStore,
  ) {}

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
    const id = createId()
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

    const storageKey = createFileStorageKey(input.projectId, id)
    const blobResult = await this.blobStore.writeText(storageKey, input.content)

    try {
      const file = await this.prisma.file.create({
        data: {
          id,
          projectId: input.projectId,
          path: input.path,
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

      return toFileRecord(file, input.content)
    } catch (error) {
      await this.blobStore.remove(storageKey)
      throw error
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
}
