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
  inviteToken: string
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

export function createProjectInvite(projectId: string, accessToken?: string | null) {
  return apiRequest<ProjectInviteDto>(`/api/projects/${projectId}/invites`, {
    method: 'POST',
    body: {
      role: 'editor',
    },
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
