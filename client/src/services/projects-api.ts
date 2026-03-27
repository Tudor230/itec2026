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
