import { describe, expect, it } from 'vitest'
import {
  buildImportPayload,
  chunkImportFiles,
  collectEntriesFromFileList,
} from './file-import'

describe('file import helpers', () => {
  it('prefers webkitRelativePath when collecting file list entries', () => {
    const file = new File(['console.log("ok")'], 'index.ts', {
      type: 'text/plain',
    })

    Object.defineProperty(file, 'webkitRelativePath', {
      value: 'src/index.ts',
    })

    const fileList = {
      0: file,
      length: 1,
      item: (index: number) => (index === 0 ? file : null),
    } as unknown as FileList

    const entries = collectEntriesFromFileList(fileList)

    expect(entries).toHaveLength(1)
    expect(entries[0]?.relativePath).toBe('src/index.ts')
  })

  it('builds payload with target prefix and skips invalid entries', async () => {
    const valid = new File(['export const value = 1'], 'value.ts', {
      type: 'text/plain',
    })
    const duplicate = new File(['export const value = 2'], 'value.ts', {
      type: 'text/plain',
    })
    const binaryLike = new File(['\u0000binary'], 'image.bin', {
      type: 'application/octet-stream',
    })

    const payload = await buildImportPayload(
      [
        { file: valid, relativePath: 'src/value.ts' },
        { file: duplicate, relativePath: 'src/value.ts' },
        { file: valid, relativePath: '../escape.ts' },
        { file: binaryLike, relativePath: 'assets/image.bin' },
      ],
      { targetPrefix: 'project' },
    )

    expect(payload.files).toHaveLength(1)
    expect(payload.files[0]?.path).toBe('project/src/value.ts')
    expect(payload.files[0]?.content).toContain('value = 2')
    expect(payload.skippedCount).toBe(2)
  })

  it('chunks import payload by file count', () => {
    const chunks = chunkImportFiles(
      [
        { path: 'a.ts', content: 'a' },
        { path: 'b.ts', content: 'b' },
        { path: 'c.ts', content: 'c' },
      ],
      { maxFilesPerChunk: 2, maxChunkBytes: 10_000 },
    )

    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toHaveLength(2)
    expect(chunks[1]).toHaveLength(1)
  })
})
