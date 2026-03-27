import type { ActorContext } from '../auth/actor-context.js'
import type { ProjectInput, ProjectUpdateInput } from './project.types.js'
import { ProjectsRepository } from './projects.repository.js'

export class ProjectsService {
  constructor(private readonly repository: ProjectsRepository) {}

  list(actor: ActorContext) {
    return this.repository.list(actor)
  }

  getById(actor: ActorContext, projectId: string) {
    return this.repository.getById(actor, projectId)
  }

  create(actor: ActorContext, input: ProjectInput) {
    return this.repository.create(actor, input)
  }

  update(actor: ActorContext, projectId: string, input: ProjectUpdateInput) {
    return this.repository.update(actor, projectId, input)
  }

  remove(actor: ActorContext, projectId: string) {
    return this.repository.remove(actor, projectId)
  }
}
