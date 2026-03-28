import type { Socket } from 'socket.io'
import { parseBearerToken } from './bearer-token.js'
import { anonymousActor, type ActorContext } from './actor-context.js'
import { subjectFromToken } from './token-subject.js'

interface SocketHandshakeAuth {
  token?: unknown
}

export async function actorContextFromSocket(socket: Socket): Promise<ActorContext> {
  const auth = socket.handshake.auth as SocketHandshakeAuth | undefined
  const raw = typeof auth?.token === 'string' ? auth.token : undefined

  if (!raw) {
    return anonymousActor
  }

  const parsed = parseBearerToken(raw) ?? raw
  const token = parsed.trim()

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
