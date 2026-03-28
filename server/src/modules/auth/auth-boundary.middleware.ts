import type { NextFunction, Request, Response } from 'express'
import { anonymousActor, type ActorContext } from './actor-context.js'
import { parseBearerToken } from './bearer-token.js'
import { subjectFromToken } from './token-subject.js'

async function resolveActor(request: Request): Promise<ActorContext> {
  const token = parseBearerToken(request.header('authorization'))

  if (!token) {
    return anonymousActor
  }

  const subject = await subjectFromToken(token)
  if (!subject) {
    return anonymousActor
  }

  return {
    type: 'token_present',
    subject,
    token,
  }
}

export function authBoundaryMiddleware(
  request: Request,
  _response: Response,
  next: NextFunction,
) {
  void resolveActor(request)
    .then((actor) => {
      request.actor = actor
      next()
    })
    .catch(() => {
      request.actor = anonymousActor
      next()
    })
}
