export interface FileRecord {
  id: string
  projectId: string
  path: string
  content: string
  ownerSubject: string | null
  createdAt: string
  updatedAt: string
}

export interface FileInput {
  projectId: string
  path: string
  content: string
}
