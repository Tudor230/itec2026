import type { Server as HttpServer } from 'node:http'
import type { Socket } from 'socket.io'
import type { ActorContext } from '../modules/auth/actor-context.js'
import { createCollabGateway } from '../modules/collab/collab.gateway.js'

export function createCollabServer(
  server: HttpServer,
  resolveActor: (socket: Socket) => ActorContext,
) {
  return createCollabGateway(server, resolveActor)
}
