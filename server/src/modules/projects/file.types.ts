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

export type ImportConflictStrategy = 'skip' | 'overwrite' | 'fail'

export interface ImportedFileInput {
  path: string
  content: string
}

export interface ImportFilesInput {
  projectId: string
  files: ImportedFileInput[]
  conflictStrategy: ImportConflictStrategy
}

export interface ImportFilesResult {
  created: FileRecord[]
  updated: FileRecord[]
  skipped: Array<{
    path: string
    reason: 'already_exists'
  }>
}

export interface FolderRecord {
  path: string
}
