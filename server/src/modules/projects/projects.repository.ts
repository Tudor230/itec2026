import type { PrismaClient } from '@prisma/client'
import type { ActorContext } from '../auth/actor-context.js'
import { createId } from './id.js'
import type {
  ProjectInput,
  ProjectRecord,
  ProjectUpdateInput,
} from './project.types.js'

type ProjectRow = {
  id: string
  name: string
  ownerSubject: string | null
  createdAt: Date
  updatedAt: Date
}

function toProjectRecord(project: ProjectRow): ProjectRecord {
  const createdAt = project.createdAt.toISOString()
  const updatedAt = project.updatedAt.toISOString()

  return {
    id: project.id,
    name: project.name,
    ownerSubject: project.ownerSubject,
    createdAt,
    updatedAt,
  }
}

export class ProjectsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(actor: ActorContext): Promise<ProjectRecord[]> {
    const ownerSubject = actor.subject
    if (!ownerSubject) {
      return []
    }

    const projects: ProjectRow[] = await this.prisma.project.findMany({
      where: {
        ownerSubject,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    })

    return projects.map((project: ProjectRow) => toProjectRecord(project))
  }

  async getById(actor: ActorContext, id: string): Promise<ProjectRecord | null> {
    const ownerSubject = actor.subject
    if (!ownerSubject) {
      return null
    }

    const project = await this.prisma.project.findFirst({
      where: {
        id,
        ownerSubject,
      },
    })

    return project ? toProjectRecord(project) : null
  }

  async create(actor: ActorContext, input: ProjectInput): Promise<ProjectRecord> {
    const id = createId()
    const ownerSubject = actor.subject

    if (!ownerSubject) {
      throw Object.assign(new Error('Authentication is required'), {
        code: 'AUTH_REQUIRED',
      })
    }

    const project = await this.prisma.project.create({
      data: {
        id,
        name: input.name,
        ownerSubject,
      },
    })

    return toProjectRecord(project)
  }

  async update(
    actor: ActorContext,
    id: string,
    input: ProjectUpdateInput,
  ): Promise<ProjectRecord | null> {
    const current = await this.getById(actor, id)
    if (!current) {
      return null
    }

    const nextName = input.name ?? current.name

    const result = await this.prisma.project.updateMany({
      where: {
        id,
        ownerSubject: current.ownerSubject,
      },
      data: {
        name: nextName,
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

    const result = await this.prisma.project.deleteMany({
      where: {
        id,
        ownerSubject,
      },
    })

    return result.count > 0
  }
}
