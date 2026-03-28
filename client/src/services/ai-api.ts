import { apiRequest } from './api-client'

export type StructuredDiffLineType = 'context' | 'add' | 'remove'

export interface StructuredDiffLine {
  type: StructuredDiffLineType
  content: string
}

export interface StructuredDiffHunk {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: StructuredDiffLine[]
}

export interface StructuredDiff {
  filePath: string
  oldPath: string
  newPath: string
  hunks: StructuredDiffHunk[]
}

export interface AiEditResponse {
  summary: string
  diff: StructuredDiff
  updatedContent: string
  warnings: string[]
}

export interface AiEditRequest {
  prompt: string
  filePath: string
  fileContent: string
  language?: string
}

export function requestAiEditCurrentFile(
  input: AiEditRequest,
  accessToken?: string | null,
) {
  return apiRequest<AiEditResponse>('/api/ai/edit-current-file', {
    method: 'POST',
    body: input,
    accessToken,
  })
}
