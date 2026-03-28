export interface CollabFileCreatedEvent {
  id: string
  projectId: string
  path: string
  createdAt: string
  updatedAt: string
}

export interface CollabFileUpdatedEvent {
  id: string
  projectId: string
  path: string
  createdAt: string
  updatedAt: string
}

export interface CollabFileDeletedEvent {
  id: string
  projectId: string
  path: string
  deletedAt: string
}

type FileCreatedListener = (file: CollabFileCreatedEvent) => void
type FileUpdatedListener = (file: CollabFileUpdatedEvent) => void
type FileDeletedListener = (file: CollabFileDeletedEvent) => void

const fileCreatedListeners = new Set<FileCreatedListener>()
const fileUpdatedListeners = new Set<FileUpdatedListener>()
const fileDeletedListeners = new Set<FileDeletedListener>()

export function registerCollabFileCreatedListener(listener: FileCreatedListener) {
  fileCreatedListeners.add(listener)

  return () => {
    fileCreatedListeners.delete(listener)
  }
}

export function registerCollabFileUpdatedListener(listener: FileUpdatedListener) {
  fileUpdatedListeners.add(listener)

  return () => {
    fileUpdatedListeners.delete(listener)
  }
}

export function registerCollabFileDeletedListener(listener: FileDeletedListener) {
  fileDeletedListeners.add(listener)

  return () => {
    fileDeletedListeners.delete(listener)
  }
}

export function emitCollabFileCreated(file: CollabFileCreatedEvent) {
  fileCreatedListeners.forEach((listener) => {
    listener(file)
  })
}

export function emitCollabFileUpdated(file: CollabFileUpdatedEvent) {
  fileUpdatedListeners.forEach((listener) => {
    listener(file)
  })
}

export function emitCollabFileDeleted(file: CollabFileDeletedEvent) {
  fileDeletedListeners.forEach((listener) => {
    listener(file)
  })
}
