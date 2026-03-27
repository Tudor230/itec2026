import type { File, PrismaClient } from '@prisma/client'
import type { ActorContext } from '../auth/actor-context.js'
import { createId } from './id.js'
import type { FileInput, FileRecord } from './file.types.js'

function toFileRecord(file: File): FileRecord {
  const createdAt = file.createdAt.toISOString()
  const updatedAt = file.updatedAt.toISOString()

  return {
    id: file.id,
    projectId: file.projectId,
    path: file.path,
    content: file.content,
    ownerSubject: file.ownerSubject,
    createdAt,
    updatedAt,
  }
}

export class FilesRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listByProject(actor: ActorContext, projectId: string): Promise<FileRecord[]> {
    const ownerSubject = actor.subject
    if (!ownerSubject) {
      return []
    }

    const files = await this.prisma.file.findMany({
      where: {
        projectId,
        ownerSubject,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    })

    return files.map((file) => toFileRecord(file))
  }

  async getById(actor: ActorContext, id: string): Promise<FileRecord | null> {
    const ownerSubject = actor.subject
    if (!ownerSubject) {
      return null
    }

    const file = await this.prisma.file.findFirst({
      where: {
        id,
        ownerSubject,
      },
    })

    return file ? toFileRecord(file) : null
  }

  async create(actor: ActorContext, input: FileInput): Promise<FileRecord> {
    const id = createId()
    const ownerSubject = actor.subject

    if (!ownerSubject) {
      throw Object.assign(new Error('Authentication is required'), {
        code: 'AUTH_REQUIRED',
      })
    }

    const project = await this.prisma.project.findFirst({
      where: {
        id: input.projectId,
        ownerSubject,
      },
      select: {
        id: true,
      },
    })

    if (!project) {
      throw Object.assign(new Error('Project not found'), {
        code: 'P2025',
      })
    }

    const file = await this.prisma.file.create({
      data: {
        id,
        projectId: input.projectId,
        path: input.path,
        content: input.content,
        ownerSubject,
      },
    })

    return toFileRecord(file)
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

    const nextPath = updates.path ?? current.path
    const nextContent = updates.content ?? current.content

    const result = await this.prisma.file.updateMany({
      where: {
        id,
        ownerSubject: current.ownerSubject,
      },
      data: {
        path: nextPath,
        content: nextContent,
      },
    })

    if (result.count === 0) {
      return null
    }

    return this.getById(actor, id)
  }

  async remove(actor: ActorContext, id: string): Promise<boolean> {
    const ownerSubject = actor.subject
    if (!ownerSubject) {
      return false
    }

    const result = await this.prisma.file.deleteMany({
      where: {
        id,
        ownerSubject,
      },
    })

    return result.count > 0
  }
}
