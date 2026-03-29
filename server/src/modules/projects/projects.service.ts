import type { ActorContext } from '../auth/actor-context.js'
import type {
  ActiveProjectInviteRecord,
  CreateProjectInviteResult,
  ImportGithubProjectInput,
  ImportGithubProjectResult,
  InvitePreviewRecord,
  ProjectMemberRecord,
  ProjectInput,
  ProjectMemberProfileInput,
  ProjectRecord,
  ProjectUpdateInput,
} from './project.types.js'
import { ProjectsRepository } from './projects.repository.js'
import type { FilesService } from './files.service.js'
import type { ProjectWorkspaceSyncService } from './project-workspace-sync-service.js'
import type { GithubPublicImporter } from './github-public-importer.js'

export class ProjectsService {
  constructor(
    private readonly repository: ProjectsRepository,
    private readonly options?: {
      filesService?: FilesService
      githubImporter?: GithubPublicImporter
      workspaceSync?: ProjectWorkspaceSyncService
    },
  ) {}

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

  async importFromGithubPublic(
    actor: ActorContext,
    input: ImportGithubProjectInput,
  ): Promise<ImportGithubProjectResult> {
    const filesService = this.options?.filesService
    const githubImporter = this.options?.githubImporter

    if (!filesService || !githubImporter) {
      throw Object.assign(new Error('GitHub import is unavailable'), {
        code: 'GITHUB_IMPORT_UNAVAILABLE',
      })
    }

    const imported = await githubImporter.importRepository(input.githubUrl)
    const project = await this.repository.create(actor, {
      name: input.name?.trim() || imported.source.repo,
    })

    try {
      const importedFiles = await filesService.importFiles(actor, {
        projectId: project.id,
        files: imported.files,
        conflictStrategy: 'skip',
      })

      if (this.options?.workspaceSync) {
        await this.options.workspaceSync.hydrateProjectWorkspace(project.id)
      }

      return {
        project,
        importedFileCount: importedFiles.created.length + importedFiles.updated.length,
        skippedFileCount: imported.skippedFileCount + importedFiles.skipped.length,
        source: imported.source,
      }
    } catch (error) {
      await this.repository.remove(actor, project.id)
      throw error
    }
  }
}
