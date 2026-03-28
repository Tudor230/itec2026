import { Router } from 'express'
import type { PrismaClient } from '@prisma/client'
import { asyncHandler } from '../../http/async-handler.js'
import { actorFromRequest } from '../auth/request-actor.js'
import { requireTokenPresent } from '../auth/require-token-present.middleware.js'
import { ProjectsRepository } from './projects.repository.js'
import { ProjectsService } from './projects.service.js'

export function createInvitesRouter({ prisma }: { prisma: PrismaClient }) {
  const router = Router()
  const service = new ProjectsService(new ProjectsRepository(prisma))

  router.get('/:token', requireTokenPresent, asyncHandler(async (request, response) => {
    const preview = await service.getInvitePreview(request.params.token)
    if (!preview) {
      response.status(404).json({
        ok: false,
        error: { message: 'Invite not found', code: 'INVITE_INVALID' },
      })
      return
    }

    response.json({
      ok: true,
      data: preview,
    })
  }))

  router.post('/:token/accept', requireTokenPresent, asyncHandler(async (request, response) => {
    const actor = actorFromRequest(request)

    try {
      const project = await service.acceptInvite(actor, request.params.token)
      response.json({
        ok: true,
        data: project,
      })
    } catch (error) {
      const dbLikeError = error as { code?: string }

      if (dbLikeError.code === 'INVITE_INVALID') {
        response.status(404).json({
          ok: false,
          error: { message: 'Invite is invalid', code: 'INVITE_INVALID' },
        })
        return
      }

      if (dbLikeError.code === 'INVITE_EXPIRED') {
        response.status(410).json({
          ok: false,
          error: { message: 'Invite has expired', code: 'INVITE_EXPIRED' },
        })
        return
      }

      if (dbLikeError.code === 'INVITE_CONSUMED') {
        response.status(409).json({
          ok: false,
          error: { message: 'Invite already used', code: 'INVITE_CONSUMED' },
        })
        return
      }

      throw error
    }
  }))

  return router
}
