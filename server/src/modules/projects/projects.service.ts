import type { ActorContext } from '../auth/actor-context.js'
import type {
  ActiveProjectInviteRecord,
  CreateProjectInviteResult,
  InvitePreviewRecord,
  ProjectMemberRecord,
  ProjectInput,
  ProjectMemberProfileInput,
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

  createInvite(actor: ActorContext, projectId: string): Promise<CreateProjectInviteResult> {
    return this.repository.createInvite(actor, projectId)
  }

  listMembers(actor: ActorContext, projectId: string): Promise<ProjectMemberRecord[]> {
    return this.repository.listMembers(actor, projectId)
  }

  updateMemberProfile(
    actor: ActorContext,
    projectId: string,
    input: ProjectMemberProfileInput,
  ): Promise<boolean> {
    return this.repository.updateMemberProfile(actor, projectId, input)
  }

  listActiveInvites(actor: ActorContext, projectId: string): Promise<ActiveProjectInviteRecord[]> {
    return this.repository.listActiveInvites(actor, projectId)
  }

  revokeInvite(actor: ActorContext, projectId: string, inviteId: string): Promise<boolean> {
    return this.repository.revokeInvite(actor, projectId, inviteId)
  }

  getInvitePreview(token: string): Promise<InvitePreviewRecord | null> {
    return this.repository.getInvitePreview(token)
  }

  acceptInvite(actor: ActorContext, token: string): Promise<ProjectRecord> {
    return this.repository.acceptInvite(actor, token)
  }
}
