import assert from 'node:assert/strict'
import { mkdtemp, open, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { LocalProjectWorkspaceStore } from './project-workspace-store.js'

describe('local project workspace store', () => {
  const tempRoots: string[] = []

  afterEach(async () => {
    while (tempRoots.length > 0) {
      const root = tempRoots.pop()
      if (!root) {
        continue
      }

      await rm(root, { recursive: true, force: true })
    }
  })

  it('replaces project files without deleting the project root directory', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'workspace-store-'))
    tempRoots.push(root)

    const store = new LocalProjectWorkspaceStore(root)
    await store.ensureProjectWorkspace('project1')
    await store.writeFile('project1', 'src/old.ts', 'old')

    const projectRoot = store.getProjectWorkspacePath('project1')
    const rootHandle = await open(projectRoot, 'r')

    try {
      await store.replaceProjectFiles('project1', [
        {
          path: 'src/new.ts',
          content: 'new',
        },
      ])
    } finally {
      await rootHandle.close()
    }

    const files = await store.listTextFiles('project1')
    assert.deepEqual(
      files.map((file) => file.path),
      ['src/new.ts'],
    )
    assert.equal(files[0]?.content, 'new')
  })
})
