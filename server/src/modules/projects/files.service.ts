import type { ActorContext } from '../auth/actor-context.js'
import type { FileInput } from './file.types.js'
import { FilesRepository } from './files.repository.js'

export class FilesService {
  constructor(private readonly repository: FilesRepository) {}

  listByProject(actor: ActorContext, projectId: string) {
    return this.repository.listByProject(actor, projectId)
  }

  getById(actor: ActorContext, fileId: string) {
    return this.repository.getById(actor, fileId)
  }

  create(actor: ActorContext, input: FileInput) {
    return this.repository.create(actor, input)
  }

  update(
    actor: ActorContext,
    fileId: string,
    updates: Partial<Pick<FileInput, 'path' | 'content'>>,
  ) {
    return this.repository.update(actor, fileId, updates)
  }

  remove(actor: ActorContext, fileId: string) {
    return this.repository.remove(actor, fileId)
  }
}
