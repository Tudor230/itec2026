export interface ProjectRecord {
  id: string
  name: string
  ownerSubject: string | null
  createdAt: string
  updatedAt: string
}

export interface ProjectInput {
  name: string
}

export interface ProjectUpdateInput {
  name?: string
}

export interface ProjectInviteRecord {
  id: string
  projectId: string
  role: 'editor'
  createdBySubject: string
  expiresAt: string
  consumedAt: string | null
  consumedBySubject: string | null
  revokedAt: string | null
  createdAt: string
}

export interface CreateProjectInviteResult {
  invite: ProjectInviteRecord
  inviteToken: string
}

export interface InvitePreviewRecord {
  projectId: string
  projectName: string
  role: 'editor'
  expiresAt: string
  isExpired: boolean
  isConsumed: boolean
  isRevoked: boolean
}
