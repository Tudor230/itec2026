import type { WorkspaceAiSuggestion } from '../components/workspace/ai-response-types'
import { applySingleHunkPreview } from './apply-structured-diff'

type WorkspaceAiSuggestionSeed = Pick<
  WorkspaceAiSuggestion,
  'id' | 'responseId' | 'fileId' | 'filePath' | 'summary' | 'warnings' | 'hunk' | 'fallbackUpdatedContent'
>

function getFallbackAddedLines(suggestion: WorkspaceAiSuggestionSeed) {
  return suggestion.hunk.lines
    .filter((line) => line.type === 'add')
    .map((line) => line.content)
}

export function buildAiSuggestionPreview(
  suggestion: WorkspaceAiSuggestionSeed,
  currentContent: string,
): WorkspaceAiSuggestion {
  const previewApplied = applySingleHunkPreview(currentContent, suggestion.hunk)

  if (!previewApplied.ok) {
    const fallbackAddedLines = getFallbackAddedLines(suggestion)

    return {
      ...suggestion,
      status: 'conflict',
      previewAddedStartLine: Math.max(1, suggestion.hunk.oldStart),
      previewAddedLineCount: Math.max(1, suggestion.hunk.newLines || suggestion.hunk.oldLines),
      previewRemovedLineNumbers: [],
      previewAddedLines: fallbackAddedLines,
      error: previewApplied.reason,
    }
  }

  return {
    ...suggestion,
    status: 'pending',
    previewAddedStartLine: previewApplied.previewAddedStartLine,
    previewAddedLineCount: previewApplied.previewAddedLineCount,
    previewRemovedLineNumbers: previewApplied.previewRemovedLineNumbers,
    previewAddedLines: previewApplied.previewAddedLines,
    error: null,
  }
}

export function rebuildAiSuggestionPreviews(
  suggestions: WorkspaceAiSuggestion[],
  currentContent: string,
) {
  return suggestions.map((suggestion) => {
    return buildAiSuggestionPreview(
      {
        id: suggestion.id,
        responseId: suggestion.responseId,
        fileId: suggestion.fileId,
        filePath: suggestion.filePath,
        summary: suggestion.summary,
        warnings: suggestion.warnings,
        hunk: suggestion.hunk,
        fallbackUpdatedContent: suggestion.fallbackUpdatedContent,
      },
      currentContent,
    )
  })
}
