import { apiRequest } from './api-client'

export interface ProjectDto {
  id: string
  name: string
  ownerSubject: string | null
  createdAt: string
  updatedAt: string
}

export interface FileDto {
  id: string
  projectId: string
  path: string
  content: string
  ownerSubject: string | null
  createdAt: string
  updatedAt: string
}

export interface FolderDto {
  path: string
}

export interface ImportedFileInputDto {
  path: string
  content: string
}

export interface FileImportSkippedDto {
  path: string
  reason: string
}

export interface FileImportFailedDto {
  path: string
  reason: string
}

export interface FileImportResultDto {
  imported: FileDto[]
  skipped: FileImportSkippedDto[]
  failed: FileImportFailedDto[]
}

export interface ProjectInviteDto {
  id: string
  projectId: string
  role: 'editor'
  createdBySubject: string
  expiresAt: string
  consumedAt: string | null
  consumedBySubject: string | null
  revokedAt: string | null
  createdAt: string
  inviteToken?: string
}

export interface ProjectCollaboratorDto {
  subject: string | null
  displayName: string | null
  email: string | null
  role: 'owner' | 'editor'
  addedBySubject: string | null
  createdAt: string
}

export interface ProjectDashboardDto {
  project: ProjectDto
  actorRole: 'owner' | 'editor'
  collaborators: ProjectCollaboratorDto[]
  activeInvites: ProjectInviteDto[]
}

export interface ActiveProjectInviteDto {
  id: string
  projectId: string
  role: 'editor'
  createdBySubject: string
  expiresAt: string
  createdAt: string
}

export interface ProjectMemberDto {
  subject: string
  displayName: string | null
  email: string | null
  role: string
}

export interface InvitePreviewDto {
  projectId: string
  projectName: string
  role: 'editor'
  expiresAt: string
  isExpired: boolean
  isConsumed: boolean
  isRevoked: boolean
}

export interface ProjectHistoryEntryDto {
  id: string
  fileId: string
  filePath: string
  historyEntryId: string
  source: 'snapshot' | 'update'
  sequence: number
  createdAt: string
}

export interface FileHistoryEntryDto {
  id: string
  source: 'snapshot' | 'update'
  sequence: number
  createdAt: string
  fileId: string
  filePath: string
}

export interface FileHistoryPreviewDto {
  id: string
  fileId: string
  source: 'snapshot' | 'update'
  sequence: number
  content: string
}

export interface FileHistoryRestoreDto {
  file: FileDto
  restoredFrom: {
    historyEntryId: string
    source: 'snapshot' | 'update'
    sequence: number
  }
}

export interface ProjectHistoryRestoreDto {
  file: FileDto
  restoredFrom: {
    fileId: string
    historyEntryId: string
    source: 'snapshot' | 'update'
    sequence: number
  }
}

export function listProjects(accessToken?: string | null) {
  return apiRequest<ProjectDto[]>('/api/projects', { accessToken })
}

export function createProject(name: string, accessToken?: string | null) {
  return apiRequest<ProjectDto>('/api/projects', {
    method: 'POST',
    body: { name },
    accessToken,
  })
}

export function getProject(projectId: string, accessToken?: string | null) {
  return apiRequest<ProjectDto>(`/api/projects/${projectId}`, { accessToken })
}

export function getProjectDashboard(projectId: string, accessToken?: string | null) {
  return apiRequest<ProjectDashboardDto>(`/api/projects/${projectId}/dashboard`, { accessToken })
}

export function updateProject(projectId: string, input: { name?: string }, accessToken?: string | null) {
  return apiRequest<ProjectDto>(`/api/projects/${projectId}`, {
    method: 'PATCH',
    body: input,
    accessToken,
  })
}

export function removeProjectCollaborator(
  projectId: string,
  subject: string,
  accessToken?: string | null,
) {
  return apiRequest<{ removed: boolean }>(
    `/api/projects/${projectId}/collaborators/${encodeURIComponent(subject)}`,
    {
      method: 'DELETE',
      accessToken,
    },
  )
}

export function deleteProject(projectId: string, accessToken?: string | null) {
  return apiRequest<{ deleted: boolean }>(`/api/projects/${projectId}`, {
    method: 'DELETE',
    accessToken,
  })
}

export function listFiles(projectId: string, accessToken?: string | null) {
  const query = new URLSearchParams({ projectId })
  return apiRequest<FileDto[]>(`/api/files?${query.toString()}`, { accessToken })
}

export function createFile(input: {
  projectId: string
  path: string
  content: string
}, accessToken?: string | null) {
  return apiRequest<FileDto>('/api/files', {
    method: 'POST',
    body: input,
    accessToken,
  })
}

export function updateFile(fileId: string, input: {
  path?: string
  content?: string
}, accessToken?: string | null) {
  return apiRequest<FileDto>(`/api/files/${fileId}`, {
    method: 'PATCH',
    body: input,
    accessToken,
  })
}

export function listProjectHistory(
  projectId: string,
  accessToken?: string | null,
  limit = 50,
) {
  const query = new URLSearchParams({ projectId, limit: String(limit) })
  return apiRequest<ProjectHistoryEntryDto[]>(`/api/files/history/project?${query.toString()}`, { accessToken })
}

export function restoreProjectHistoryEntry(
  eventId: string,
  input: { projectId: string },
  accessToken?: string | null,
) {
  return apiRequest<ProjectHistoryRestoreDto>(`/api/files/history/project/${encodeURIComponent(eventId)}/restore`, {
    method: 'POST',
    body: input,
    accessToken,
  })
}

export function listFileHistory(
  projectId: string,
  fileId: string,
  accessToken?: string | null,
  limit = 50,
) {
  const query = new URLSearchParams({ projectId, limit: String(limit) })
  return apiRequest<FileHistoryEntryDto[]>(`/api/files/history/file/${fileId}?${query.toString()}`, {
    accessToken,
  })
}

export function getFileHistoryVersion(
  projectId: string,
  fileId: string,
  historyEntryId: string,
  accessToken?: string | null,
) {
  const query = new URLSearchParams({ projectId })
  return apiRequest<FileHistoryPreviewDto>(
    `/api/files/history/file/${fileId}/${encodeURIComponent(historyEntryId)}?${query.toString()}`,
    {
      accessToken,
    },
  )
}

export function restoreFileHistoryEntry(
  projectId: string,
  fileId: string,
  historyEntryId: string,
  accessToken?: string | null,
) {
  return apiRequest<FileHistoryRestoreDto>(`/api/files/history/file/${fileId}/${encodeURIComponent(historyEntryId)}/restore`, {
    method: 'POST',
    body: {
      projectId,
    },
    accessToken,
  })
}

export function deleteFile(fileId: string, accessToken?: string | null) {
  return apiRequest<{ deleted: boolean }>(`/api/files/${fileId}`, {
    method: 'DELETE',
    accessToken,
  })
}

export function listFolders(projectId: string, accessToken?: string | null) {
  const query = new URLSearchParams({ projectId })
  return apiRequest<FolderDto[]>(`/api/files/folders?${query.toString()}`, { accessToken })
}

export function createFolder(input: { projectId: string; path: string }, accessToken?: string | null) {
  return apiRequest<FolderDto>('/api/files/folders', {
    method: 'POST',
    body: input,
    accessToken,
  })
}

export function renameFolder(
  input: { projectId: string; fromPath: string; toPath: string },
  accessToken?: string | null,
) {
  return apiRequest<{ renamed: boolean }>('/api/files/folders', {
    method: 'PATCH',
    body: input,
    accessToken,
  })
}

export function deleteFolder(input: { projectId: string; path: string }, accessToken?: string | null) {
  return apiRequest<{ deleted: boolean }>('/api/files/folders', {
    method: 'DELETE',
    body: input,
    accessToken,
  })
}

export function importLocalFiles(
  input: { projectId: string; files: ImportedFileInputDto[] },
  accessToken?: string | null,
) {
  return apiRequest<FileImportResultDto>('/api/files/import/local', {
    method: 'POST',
    body: input,
    accessToken,
  })
}

export function importGithubProject(
  input: { projectId: string; repositoryUrl: string; branch?: string },
  accessToken?: string | null,
) {
  return apiRequest<FileImportResultDto>('/api/files/import/github', {
    method: 'POST',
    body: input,
    accessToken,
  })
}

export function createProjectInvite(projectId: string, accessToken?: string | null) {
  return apiRequest<ProjectInviteDto>(`/api/projects/${projectId}/invites`, {
    method: 'POST',
    body: {
      role: 'editor',
    },
    accessToken,
  })
}

export function listProjectMembers(projectId: string, accessToken?: string | null) {
  return apiRequest<ProjectMemberDto[]>(`/api/projects/${projectId}/members`, {
    accessToken,
  })
}

export function updateMyProjectMemberProfile(
  projectId: string,
  input: { displayName: string; email?: string },
  accessToken?: string | null,
) {
  return apiRequest<{ updated: boolean }>(`/api/projects/${projectId}/members/me`, {
    method: 'PATCH',
    body: input,
    accessToken,
  })
}

export function listProjectInvites(projectId: string, accessToken?: string | null) {
  return apiRequest<ActiveProjectInviteDto[]>(`/api/projects/${projectId}/invites`, {
    accessToken,
  })
}

export function revokeProjectInvite(
  projectId: string,
  input: { inviteId: string },
  accessToken?: string | null,
) {
  return apiRequest<{ revoked: boolean }>(`/api/projects/${projectId}/invites`, {
    method: 'DELETE',
    body: input,
    accessToken,
  })
}

export function removeProjectMember(
  projectId: string,
  input: { subject: string },
  accessToken?: string | null,
) {
  return apiRequest<{ removed: boolean }>(`/api/projects/${projectId}/members`, {
    method: 'DELETE',
    body: input,
    accessToken,
  })
}

export function getInvitePreview(token: string, accessToken?: string | null) {
  return apiRequest<InvitePreviewDto>(`/api/invites/${token}`, {
    accessToken,
  })
}

export function acceptInvite(token: string, accessToken?: string | null) {
  return apiRequest<ProjectDto>(`/api/invites/${token}/accept`, {
    method: 'POST',
    accessToken,
  })
}
