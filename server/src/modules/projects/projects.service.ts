import type { ActorContext } from '../auth/actor-context.js'
import type {
  CreateProjectInviteResult,
  InvitePreviewRecord,
  ProjectDashboardRecord,
  ProjectInput,
  ProjectRecord,
  ProjectUpdateInput,
} from './project.types.js'
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

  getDashboard(actor: ActorContext, projectId: string): Promise<ProjectDashboardRecord | null> {
    return this.repository.getDashboard(actor, projectId)
  }

  removeCollaborator(actor: ActorContext, projectId: string, subject: string): Promise<boolean> {
    return this.repository.removeCollaborator(actor, projectId, subject)
  }

  createInvite(actor: ActorContext, projectId: string): Promise<CreateProjectInviteResult> {
    return this.repository.createInvite(actor, projectId)
  }

  getInvitePreview(token: string): Promise<InvitePreviewRecord | null> {
    return this.repository.getInvitePreview(token)
  }

  acceptInvite(actor: ActorContext, token: string): Promise<ProjectRecord> {
    return this.repository.acceptInvite(actor, token)
  }
}
