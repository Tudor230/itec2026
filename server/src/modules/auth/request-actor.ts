import type { Request } from 'express'
import type { ActorContext } from './actor-context.js'
import { anonymousActor } from './actor-context.js'

export function actorFromRequest(request: Request): ActorContext {
  return request.actor ?? anonymousActor
}
