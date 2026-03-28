import type { NextFunction, Request, Response } from 'express'
import { actorFromRequest } from './request-actor.js'

export function requireTokenPresent(
  request: Request,
  response: Response,
  next: NextFunction,
) {
  const actor = actorFromRequest(request)

  if (actor.type === 'anonymous') {
    response.status(401).json({
      ok: false,
      error: {
        code: 'AUTH_REQUIRED',
        message: 'Authentication is required for write operations in Phase 0',
      },
    })
    return
  }

  next()
}
