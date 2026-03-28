export type ActorType = 'anonymous' | 'token_present' | 'authenticated'

export interface ActorContext {
  type: ActorType
  subject?: string
  roles?: string[]
  token?: string
}

export const anonymousActor: ActorContext = {
  type: 'anonymous',
}
