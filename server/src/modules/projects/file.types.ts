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

export interface FolderRecord {
  path: string
}

export interface ImportFileInput {
  path: string
  content: string
}

export interface LocalFilesImportInput {
  projectId: string
  files: ImportFileInput[]
}

export interface GithubImportInput {
  projectId: string
  repositoryUrl: string
  branch?: string
}

export interface FileImportSkippedEntry {
  path: string
  reason: string
}

export interface FileImportFailedEntry {
  path: string
  reason: string
}

export interface FileImportResult {
  imported: FileRecord[]
  skipped: FileImportSkippedEntry[]
  failed: FileImportFailedEntry[]
}
