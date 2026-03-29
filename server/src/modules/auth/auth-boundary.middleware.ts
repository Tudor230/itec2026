import type { NextFunction, Request, Response } from 'express'
import { anonymousActor, type ActorContext } from './actor-context.js'
import { parseBearerToken } from './bearer-token.js'
import { subjectFromToken } from './token-subject.js'
import { decodeJwt } from 'jose'

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function decodeTokenProfile(token: string): { displayName: string | null; email: string | null } {
  try {
    const payload = decodeJwt(token)

    return {
      displayName: normalizeOptionalString(payload.name)
        ?? normalizeOptionalString(payload.nickname)
        ?? normalizeOptionalString(payload.preferred_username),
      email: normalizeOptionalString(payload.email),
    }
  } catch {
    return {
      displayName: null,
      email: null,
    }
  }
}

async function resolveActor(request: Request): Promise<ActorContext> {
  const token = parseBearerToken(request.header('authorization'))

  if (!token) {
    return anonymousActor
  }

  const subject = await subjectFromToken(token)
  if (!subject) {
    return anonymousActor
  }

  const profile = decodeTokenProfile(token)

  return {
    type: 'token_present',
    subject,
    displayName: profile.displayName,
    email: profile.email,
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
