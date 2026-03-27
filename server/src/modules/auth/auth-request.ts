import type { ActorContext } from './actor-context.js'

declare global {
  namespace Express {
    interface Request {
      actor?: ActorContext
    }
  }
}

export {}
