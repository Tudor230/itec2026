import { describe, expect, it } from 'vitest'
import type { WorkspaceAiSuggestion } from '../components/workspace/ai-response-types'
import type { StructuredDiffHunk } from '../services/ai-api'
import { applySingleHunk } from './apply-structured-diff'
import { buildAiSuggestionPreview, rebuildAiSuggestionPreviews } from './ai-suggestion-preview'

function createSuggestionSeed(hunk: StructuredDiffHunk) {
  return {
    id: 'response-1-hunk-0',
    responseId: 'response-1',
    fileId: 'file-1',
    filePath: 'src/example.ts',
    summary: 'Update generated change',
    warnings: [],
    hunk,
    fallbackUpdatedContent: undefined,
  } satisfies Pick<
    WorkspaceAiSuggestion,
    'id' | 'responseId' | 'fileId' | 'filePath' | 'summary' | 'warnings' | 'hunk' | 'fallbackUpdatedContent'
  >
}

describe('ai suggestion preview helpers', () => {
  const currentContent = [
    'const start = true;',
    'function alpha() {',
    '  return 1;',
    '}',
    '',
    'function beta() {',
    '  return 2;',
    '}',
  ].join('\n')

  it('anchors each hunk preview against the current editor content', () => {
    const insertionHunk: StructuredDiffHunk = {
      oldStart: 1,
      oldLines: 1,
      newStart: 1,
      newLines: 2,
      lines: [
        { type: 'context', content: 'const start = true;' },
        { type: 'add', content: 'const inserted = 1;' },
      ],
    }
    const laterHunk: StructuredDiffHunk = {
      oldStart: 6,
      oldLines: 3,
      newStart: 7,
      newLines: 3,
      lines: [
        { type: 'context', content: 'function beta() {' },
        { type: 'remove', content: '  return 2;' },
        { type: 'add', content: '  return 3;' },
        { type: 'context', content: '}' },
      ],
    }

    const insertionPreview = buildAiSuggestionPreview(createSuggestionSeed(insertionHunk), currentContent)
    const laterPreview = buildAiSuggestionPreview(createSuggestionSeed(laterHunk), currentContent)

    expect(insertionPreview.previewAddedStartLine).toBe(2)
    expect(insertionPreview.previewAddedLines).toEqual(['const inserted = 1;'])
    expect(laterPreview.previewRemovedLineNumbers).toEqual([7])
    expect(laterPreview.previewAddedStartLine).toBe(7)
  })

  it('recomputes remaining previews after one suggestion is applied', () => {
    const insertionHunk: StructuredDiffHunk = {
      oldStart: 1,
      oldLines: 1,
      newStart: 1,
      newLines: 2,
      lines: [
        { type: 'context', content: 'const start = true;' },
        { type: 'add', content: 'const inserted = 1;' },
      ],
    }
    const laterHunk: StructuredDiffHunk = {
      oldStart: 6,
      oldLines: 3,
      newStart: 7,
      newLines: 3,
      lines: [
        { type: 'context', content: 'function beta() {' },
        { type: 'remove', content: '  return 2;' },
        { type: 'add', content: '  return 3;' },
        { type: 'context', content: '}' },
      ],
    }

    const applied = applySingleHunk(currentContent, insertionHunk)
    expect(applied.ok).toBe(true)
    if (!applied.ok) {
      return
    }

    const remainingSuggestion = buildAiSuggestionPreview(createSuggestionSeed(laterHunk), currentContent)
    const [recomputedPreview] = rebuildAiSuggestionPreviews([remainingSuggestion], applied.content)

    expect(recomputedPreview.previewRemovedLineNumbers).toEqual([8])
    expect(recomputedPreview.previewAddedStartLine).toBe(8)
  })
})
