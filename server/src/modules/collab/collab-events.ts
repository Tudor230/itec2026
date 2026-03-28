export interface CollabFileCreatedEvent {
  id: string
  projectId: string
  path: string
  createdAt: string
  updatedAt: string
}

type FileCreatedListener = (file: CollabFileCreatedEvent) => void

const fileCreatedListeners = new Set<FileCreatedListener>()

export function registerCollabFileCreatedListener(listener: FileCreatedListener) {
  fileCreatedListeners.add(listener)

  return () => {
    fileCreatedListeners.delete(listener)
  }
}

export function emitCollabFileCreated(file: CollabFileCreatedEvent) {
  fileCreatedListeners.forEach((listener) => {
    listener(file)
  })
}
