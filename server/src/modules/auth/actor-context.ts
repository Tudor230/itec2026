export type ActorType = 'anonymous' | 'token_present' | 'authenticated'

export interface ActorContext {
  type: ActorType
  subject?: string
  displayName?: string | null
  email?: string | null
  roles?: string[]
  token?: string
}

export const anonymousActor: ActorContext = {
  type: 'anonymous',
}
