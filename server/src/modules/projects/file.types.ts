export interface FileRecord {
  id: string
  projectId: string
  path: string
  content: string
  storageKey: string
  contentHash: string
  byteSize: number
  ownerSubject: string | null
  createdAt: string
  updatedAt: string
}

export interface FileInput {
  projectId: string
  path: string
  content: string
}
