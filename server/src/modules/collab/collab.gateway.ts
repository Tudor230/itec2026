import type { Server as HttpServer } from 'node:http'
import { Server } from 'socket.io'
import type { Socket } from 'socket.io'
import type { ActorContext } from '../auth/actor-context.js'

export type SocketActorResolver = (socket: Socket) => ActorContext

export function createCollabGateway(
  httpServer: HttpServer,
  resolveActor: SocketActorResolver,
) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:3000',
    },
  })

  io.on('connection', (socket) => {
    const actor = resolveActor(socket)
    const joinedRooms = new Set<string>()

    socket.emit('collab:connected', {
      actorType: actor.type,
      socketId: socket.id,
    })

    socket.on('collab:join-project', (projectId: unknown) => {
      if (typeof projectId !== 'string' || projectId.trim().length === 0) {
        socket.emit('collab:error', {
          message: 'projectId is required',
        })
        return
      }

      const room = projectRoom(projectId)
      joinedRooms.add(room)
      void socket.join(room)

      io.to(room).emit('collab:presence', {
        type: 'joined',
        projectId,
        socketId: socket.id,
        actorType: actor.type,
      })
    })

    socket.on('disconnect', () => {
      joinedRooms.forEach((room) => {
        io.to(room).emit('collab:presence', {
          type: 'left',
          socketId: socket.id,
        })
      })
    })
  })

  return io
}

function projectRoom(projectId: string) {
  return `project:${projectId}`
}
