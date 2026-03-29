import type { StructuredDiff } from '../../services/ai-api'
import type { StructuredDiffHunk } from '../../services/ai-api'

export interface WorkspaceAiResponseCard {
  responseId: string
  threadId: string
  fileId: string
  filePath: string
  originalContent?: string
  summary: string
  updatedContent: string
  diff: StructuredDiff
  warnings: string[]
}

export interface WorkspaceAiSuggestion {
  id: string
  responseId: string
  fileId: string
  filePath: string
  summary: string
  warnings: string[]
  status: 'pending' | 'conflict'
  hunk: StructuredDiffHunk
  fallbackUpdatedContent?: string
  previewAddedStartLine: number
  previewAddedLineCount: number
  previewRemovedLineNumbers: number[]
  previewAddedLines: string[]
  error: string | null
}
