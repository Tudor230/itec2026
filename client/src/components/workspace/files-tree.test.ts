import { describe, expect, it } from 'vitest'
import { buildFileTree, filterFileTree } from './files-tree'

const files = [
  {
    id: '1',
    projectId: 'p1',
    path: 'src/main.ts',
    content: '',
    ownerSubject: null,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: '2',
    projectId: 'p1',
    path: 'src/components/Button.tsx',
    content: '',
    ownerSubject: null,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: '3',
    projectId: 'p1',
    path: 'README.md',
    content: '',
    ownerSubject: null,
    createdAt: '',
    updatedAt: '',
  },
]

describe('files tree helpers', () => {
  it('builds a folder-first sorted tree', () => {
    const tree = buildFileTree(files)

    expect(tree.children.length).toBe(2)
    expect(tree.children[0].type).toBe('folder')
    expect(tree.children[0].name).toBe('src')
    expect(tree.children[1].type).toBe('file')
    expect(tree.children[1].name).toBe('README.md')
  })

  it('keeps matching parents during filtering', () => {
    const tree = buildFileTree(files)
    const filtered = filterFileTree(tree, 'button')

    expect(filtered).not.toBeNull()
    expect(filtered?.children.length).toBe(1)
    expect(filtered?.children[0].name).toBe('src')

    const srcChildren = filtered?.children[0].children ?? []
    expect(srcChildren.length).toBe(1)
    expect(srcChildren[0].name).toBe('components')
  })

  it('returns no children when no files match filter', () => {
    const tree = buildFileTree(files)
    const filtered = filterFileTree(tree, 'does-not-exist')

    expect(filtered).not.toBeNull()
    expect(filtered?.children.length).toBe(0)
  })
})
