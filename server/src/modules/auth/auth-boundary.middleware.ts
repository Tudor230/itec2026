import type { NextFunction, Request, Response } from 'express'
import { anonymousActor, type ActorContext } from './actor-context.js'
import { parseBearerToken } from './bearer-token.js'
import { subjectFromToken } from './token-subject.js'

function resolveActor(request: Request): ActorContext {
  const token = parseBearerToken(request.header('authorization'))

  if (!token) {
    return anonymousActor
  }

  return {
    type: 'token_present',
    subject: subjectFromToken(token),
    token,
  }
}

export function authBoundaryMiddleware(
  request: Request,
  _response: Response,
  next: NextFunction,
) {
  const actor = resolveActor(request)
  request.actor = actor
  next()
}
