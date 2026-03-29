import { Router } from 'express'
import type { PrismaClient } from '@prisma/client'
import { asyncHandler } from '../../http/async-handler.js'
import { actorFromRequest } from '../auth/request-actor.js'
import { requireTokenPresent } from '../auth/require-token-present.middleware.js'
import {
  createProjectInviteSchema,
  createProjectSchema,
  revokeProjectInviteSchema,
  updateProjectMemberProfileSchema,
  updateProjectSchema,
} from './project.schema.js'
import { ProjectsRepository } from './projects.repository.js'
import { ProjectsService } from './projects.service.js'

export function createProjectsRouter({ prisma }: { prisma: PrismaClient }) {
  const router = Router()
  const service = new ProjectsService(new ProjectsRepository(prisma))

  router.get('/', requireTokenPresent, asyncHandler(async (request, response) => {
    const actor = actorFromRequest(request)
    const projects = await service.list(actor)

    response.json({
      ok: true,
      data: projects,
    })
  }))

  router.get('/:projectId', requireTokenPresent, asyncHandler(async (request, response) => {
    const actor = actorFromRequest(request)
    const project = await service.getById(actor, request.params.projectId)

    if (!project) {
      response.status(404).json({
        ok: false,
        error: { message: 'Project not found', code: 'PROJECT_NOT_FOUND' },
      })
      return
    }

    response.json({
      ok: true,
      data: project,
    })
  }))

  router.get('/:projectId/dashboard', requireTokenPresent, asyncHandler(async (request, response) => {
    const actor = actorFromRequest(request)
    const dashboard = await service.getDashboard(actor, request.params.projectId)

    if (!dashboard) {
      response.status(404).json({
        ok: false,
        error: { message: 'Project not found', code: 'PROJECT_NOT_FOUND' },
      })
      return
    }

    response.json({
      ok: true,
      data: dashboard,
    })
  }))

  router.post('/', requireTokenPresent, asyncHandler(async (request, response) => {
    const parsed = createProjectSchema.safeParse(request.body)
    if (!parsed.success) {
      response.status(400).json({
        ok: false,
        error: { message: parsed.error.message, code: 'INVALID_PROJECT_INPUT' },
      })
      return
    }

    const actor = actorFromRequest(request)
    const project = await service.create(actor, parsed.data)

    response.status(201).json({
      ok: true,
      data: project,
    })
  }))

  router.patch('/:projectId', requireTokenPresent, asyncHandler(async (request, response) => {
    const parsed = updateProjectSchema.safeParse(request.body)
    if (!parsed.success) {
      response.status(400).json({
        ok: false,
        error: { message: parsed.error.message, code: 'INVALID_PROJECT_INPUT' },
      })
      return
    }

    const actor = actorFromRequest(request)
    const project = await service.update(actor, request.params.projectId, parsed.data)

    if (!project) {
      response.status(404).json({
        ok: false,
        error: { message: 'Project not found', code: 'PROJECT_NOT_FOUND' },
      })
      return
    }

    response.json({
      ok: true,
      data: project,
    })
  }))

  router.delete('/:projectId', requireTokenPresent, asyncHandler(async (request, response) => {
    const actor = actorFromRequest(request)
    const removed = await service.remove(actor, request.params.projectId)

    if (!removed) {
      response.status(404).json({
        ok: false,
        error: { message: 'Project not found', code: 'PROJECT_NOT_FOUND' },
      })
      return
    }

    response.json({
      ok: true,
      data: { deleted: true },
    })
  }))

  router.delete('/:projectId/collaborators/:subject', requireTokenPresent, asyncHandler(async (request, response) => {
    const actor = actorFromRequest(request)

    try {
      const removed = await service.removeCollaborator(
        actor,
        request.params.projectId,
        request.params.subject,
      )

      if (!removed) {
        response.status(404).json({
          ok: false,
          error: { message: 'Project or collaborator not found', code: 'COLLABORATOR_NOT_FOUND' },
        })
        return
      }

      response.json({
        ok: true,
        data: { removed: true },
      })
    } catch (error) {
      const dbLikeError = error as { code?: string }

      if (dbLikeError.code === 'PROJECT_OWNER_IMMUTABLE') {
        response.status(400).json({
          ok: false,
          error: { message: 'Project owner cannot be removed', code: 'PROJECT_OWNER_IMMUTABLE' },
        })
        return
      }

      throw error
    }
  }))

  router.post('/:projectId/invites', requireTokenPresent, asyncHandler(async (request, response) => {
    const parsed = createProjectInviteSchema.safeParse(request.body ?? {})
    if (!parsed.success) {
      response.status(400).json({
        ok: false,
        error: { message: parsed.error.message, code: 'INVALID_INVITE_INPUT' },
      })
      return
    }

    const actor = actorFromRequest(request)

    try {
      const created = await service.createInvite(actor, request.params.projectId)
      response.status(201).json({
        ok: true,
        data: {
          ...created.invite,
          inviteToken: created.inviteToken,
        },
      })
    } catch (error) {
      const dbLikeError = error as { code?: string }

      if (dbLikeError.code === 'PROJECT_FORBIDDEN') {
        response.status(403).json({
          ok: false,
          error: { message: 'Only project owners can create invites', code: 'PROJECT_FORBIDDEN' },
        })
        return
      }

      throw error
    }
  }))

  router.get('/:projectId/members', requireTokenPresent, asyncHandler(async (request, response) => {
    const actor = actorFromRequest(request)
    const members = await service.listMembers(actor, request.params.projectId)

    response.json({
      ok: true,
      data: members,
    })
  }))

  router.patch('/:projectId/members/me', requireTokenPresent, asyncHandler(async (request, response) => {
    const parsed = updateProjectMemberProfileSchema.safeParse(request.body)
    if (!parsed.success) {
      response.status(400).json({
        ok: false,
        error: { message: parsed.error.message, code: 'INVALID_MEMBER_PROFILE_INPUT' },
      })
      return
    }

    const actor = actorFromRequest(request)
    const updated = await service.updateMemberProfile(actor, request.params.projectId, parsed.data)

    if (!updated) {
      response.status(404).json({
        ok: false,
        error: { message: 'Project not found', code: 'PROJECT_NOT_FOUND' },
      })
      return
    }

    response.json({
      ok: true,
      data: { updated: true },
    })
  }))

  router.get('/:projectId/invites', requireTokenPresent, asyncHandler(async (request, response) => {
    const actor = actorFromRequest(request)
    const invites = await service.listActiveInvites(actor, request.params.projectId)

    response.json({
      ok: true,
      data: invites,
    })
  }))

  router.delete('/:projectId/invites', requireTokenPresent, asyncHandler(async (request, response) => {
    const parsed = revokeProjectInviteSchema.safeParse(request.body)
    if (!parsed.success) {
      response.status(400).json({
        ok: false,
        error: { message: parsed.error.message, code: 'INVALID_INVITE_INPUT' },
      })
      return
    }

    const actor = actorFromRequest(request)
    const revoked = await service.revokeInvite(actor, request.params.projectId, parsed.data.inviteId)

    if (!revoked) {
      response.status(404).json({
        ok: false,
        error: { message: 'Invite not found', code: 'INVITE_NOT_FOUND' },
      })
      return
    }

    response.json({
      ok: true,
      data: { revoked: true },
    })
  }))

  return router
}
