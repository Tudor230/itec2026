import type { ActorContext } from '../auth/actor-context.js'
import type { FileInput, ImportFilesInput, ImportFilesResult } from './file.types.js'
import { FilesRepository } from './files.repository.js'

export class FilesService {
  constructor(private readonly repository: FilesRepository) {}

  listByProject(actor: ActorContext, projectId: string) {
    return this.repository.listByProject(actor, projectId)
  }

  listByProjectForSync(projectId: string) {
    return this.repository.listByProjectForSync(projectId)
  }

  getById(actor: ActorContext, fileId: string) {
    return this.repository.getById(actor, fileId)
  }

  create(actor: ActorContext, input: FileInput) {
    return this.repository.create(actor, input)
  }

  createFromSync(input: FileInput, ownerSubject: string | null = null) {
    return this.repository.createFromSync(input, ownerSubject)
  }

  importFiles(actor: ActorContext, input: ImportFilesInput): Promise<ImportFilesResult> {
    return this.repository.importFiles(actor, input)
  }

  update(
    actor: ActorContext,
    fileId: string,
    updates: Partial<Pick<FileInput, 'path' | 'content'>>,
  ) {
    return this.repository.update(actor, fileId, updates)
  }

  updateFromSync(
    fileId: string,
    updates: Partial<Pick<FileInput, 'path' | 'content'>>,
  ) {
    return this.repository.updateFromSync(fileId, updates)
  }

  remove(actor: ActorContext, fileId: string) {
    return this.repository.remove(actor, fileId)
  }

  removeFromSync(fileId: string) {
    return this.repository.removeFromSync(fileId)
  }

  listFoldersByProject(actor: ActorContext, projectId: string) {
    return this.repository.listFoldersByProject(actor, projectId)
  }

  createFolder(actor: ActorContext, projectId: string, path: string) {
    return this.repository.createFolder(actor, projectId, path)
  }

  renameFolder(actor: ActorContext, projectId: string, fromPath: string, toPath: string) {
    return this.repository.renameFolder(actor, projectId, fromPath, toPath)
  }

  deleteFolder(actor: ActorContext, projectId: string, path: string) {
    return this.repository.deleteFolder(actor, projectId, path)
  }
}
