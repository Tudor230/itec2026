import type { StructuredDiff, StructuredDiffHunk, StructuredDiffLine } from '../services/ai-api'

interface ApplyStructuredDiffSuccess {
  ok: true
  content: string
}

interface ApplyStructuredDiffFailure {
  ok: false
  reason: string
}

export type ApplyStructuredDiffResult = ApplyStructuredDiffSuccess | ApplyStructuredDiffFailure

interface PreviewPatchSuccess {
  ok: true
  content: string
  previewAddedStartLine: number
  previewAddedLineCount: number
  previewRemovedLineNumbers: number[]
  previewAddedLines: string[]
}

interface PreviewPatchFailure {
  ok: false
  reason: string
}

export type PreviewPatchResult = PreviewPatchSuccess | PreviewPatchFailure

function toLines(content: string) {
  return content.split('\n')
}

function equalsSlice(lines: string[], start: number, expected: string[]) {
  if (start < 0 || start + expected.length > lines.length) {
    return false
  }

  for (let index = 0; index < expected.length; index += 1) {
    if (lines[start + index] !== expected[index]) {
      return false
    }
  }

  return true
}

function findAnchorIndex(lines: string[], expected: string[], preferred: number) {
  if (expected.length === 0) {
    return Math.max(0, Math.min(preferred, lines.length))
  }

  const maxDistance = 80
  const start = Math.max(0, preferred - maxDistance)
  const maxAnchorIndex = lines.length - expected.length
  const end = Math.min(maxAnchorIndex, preferred + maxDistance)

  if (end < start) {
    return null
  }

  const candidates: number[] = []
  for (let anchorIndex = start; anchorIndex <= end; anchorIndex += 1) {
    if (equalsSlice(lines, anchorIndex, expected)) {
      candidates.push(anchorIndex)
    }
  }

  if (candidates.length === 0) {
    return null
  }

  if (candidates.includes(preferred)) {
    return preferred
  }

  let bestIndex: number | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  let hasAmbiguousBest = false

  for (const candidate of candidates) {
    const distance = Math.abs(candidate - preferred)
    if (distance < bestDistance) {
      bestDistance = distance
      bestIndex = candidate
      hasAmbiguousBest = false
      continue
    }

    if (distance === bestDistance) {
      hasAmbiguousBest = true
    }
  }

  if (hasAmbiguousBest || bestIndex === null) {
    return null
  }

  return bestIndex
}

function buildOldAndNewSequences(diffLines: StructuredDiffLine[]) {
  const oldLines: string[] = []
  const newLines: string[] = []

  diffLines.forEach((line) => {
    if (line.type === 'context') {
      oldLines.push(line.content)
      newLines.push(line.content)
      return
    }

    if (line.type === 'remove') {
      oldLines.push(line.content)
      return
    }

    if (line.type === 'add') {
      newLines.push(line.content)
    }
  })

  return {
    oldLines,
    newLines,
  }
}

function applyOneHunk(lines: string[], hunk: StructuredDiffHunk, lineDelta: number) {
  const { oldLines, newLines } = buildOldAndNewSequences(hunk.lines)
  const preferredIndex = Math.max(0, (hunk.oldStart - 1) + lineDelta)
  const anchorIndex = findAnchorIndex(lines, oldLines, preferredIndex)

  if (anchorIndex === null) {
    return {
      ok: false as const,
      reason: `Could not apply hunk around original line ${hunk.oldStart}`,
      lineDelta,
    }
  }

  lines.splice(anchorIndex, oldLines.length, ...newLines)

  return {
    ok: true as const,
    reason: null,
    lineDelta: lineDelta + newLines.length - oldLines.length,
  }
}

export function applySingleHunk(
  currentContent: string,
  hunk: StructuredDiffHunk,
  overrideAddedContent?: string,
): ApplyStructuredDiffResult {
  const hadTrailingNewline = currentContent.endsWith('\n')
  const lines = toLines(currentContent)

  const targetHunk: StructuredDiffHunk = overrideAddedContent === undefined
    ? hunk
    : {
      ...hunk,
      lines: (() => {
        const editedAddLines = overrideAddedContent.split('\n').map((content) => ({
          type: 'add' as const,
          content,
        }))
        let inserted = false

        return hunk.lines.flatMap((line) => {
          if (line.type !== 'add') {
            return [line]
          }

          if (inserted) {
            return []
          }

          inserted = true
          return editedAddLines
        })
      })(),
    }

  const result = applyOneHunk(lines, targetHunk, 0)
  if (!result.ok) {
    return {
      ok: false,
      reason: result.reason,
    }
  }

  const nextContent = lines.join('\n')

  return {
    ok: true,
    content: hadTrailingNewline && nextContent.length > 0 ? `${nextContent}\n` : nextContent,
  }
}

export function applySingleHunkPreview(
  currentContent: string,
  hunk: StructuredDiffHunk,
): PreviewPatchResult {
  const hadTrailingNewline = currentContent.endsWith('\n')
  const lines = toLines(currentContent)
  const { oldLines, newLines } = buildOldAndNewSequences(hunk.lines)
  const preferredIndex = Math.max(0, hunk.oldStart - 1)
  const anchorIndex = findAnchorIndex(lines, oldLines, preferredIndex)

  if (anchorIndex === null) {
    return {
      ok: false,
      reason: `Could not render hunk preview around original line ${hunk.oldStart}`,
    }
  }

  const addedLines: string[] = []
  const previewRemovedLineNumbers: number[] = []
  let oldCursor = 0
  let newCursor = 0
  let firstAddRelativeIndex: number | null = null

  hunk.lines.forEach((line) => {
    if (line.type === 'context') {
      oldCursor += 1
      newCursor += 1
      return
    }

    if (line.type === 'remove') {
      previewRemovedLineNumbers.push(anchorIndex + oldCursor + 1)
      oldCursor += 1
      return
    }

    if (firstAddRelativeIndex === null) {
      firstAddRelativeIndex = newCursor
    }

    addedLines.push(line.content)
    newCursor += 1
  })

  lines.splice(anchorIndex, oldLines.length, ...newLines)

  const previewAddedLineCount = addedLines.length
  const previewAddedStartLine = previewAddedLineCount > 0
    ? anchorIndex + (firstAddRelativeIndex ?? 0) + 1
    : Math.max(1, Math.min(lines.length, anchorIndex + 1))

  const nextContent = lines.join('\n')

  return {
    ok: true,
    content: hadTrailingNewline && nextContent.length > 0 ? `${nextContent}\n` : nextContent,
    previewAddedStartLine,
    previewAddedLineCount,
    previewRemovedLineNumbers,
    previewAddedLines: addedLines,
  }
}

export function applyStructuredDiff(currentContent: string, diff: StructuredDiff): ApplyStructuredDiffResult {
  const hadTrailingNewline = currentContent.endsWith('\n')
  const lines = toLines(currentContent)
  let lineDelta = 0

  for (const hunk of diff.hunks) {
    const result = applyOneHunk(lines, hunk, lineDelta)
    if (!result.ok) {
      return {
        ok: false,
        reason: result.reason,
      }
    }

    lineDelta = result.lineDelta
  }

  const nextContent = lines.join('\n')

  return {
    ok: true,
    content: hadTrailingNewline && nextContent.length > 0 ? `${nextContent}\n` : nextContent,
  }
}
