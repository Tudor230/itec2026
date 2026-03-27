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
