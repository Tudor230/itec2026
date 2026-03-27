import type { FileDto } from '../../services/projects-api'

export interface FileTreeNode {
  id: string
  name: string
  path: string
  type: 'folder' | 'file'
  children: FileTreeNode[]
  fileId?: string
}

function insertPath(root: FileTreeNode, file: FileDto) {
  const segments = file.path.split('/').filter((segment) => segment.trim().length > 0)

  if (segments.length === 0) {
    return
  }

  let cursor = root

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]
    const isLeaf = index === segments.length - 1
    const nodePath = segments.slice(0, index + 1).join('/')
    const nextType = isLeaf ? 'file' : 'folder'

    let next = cursor.children.find((candidate) => {
      return candidate.name === segment && candidate.type === nextType
    })

    if (!next) {
      next = {
        id: `${nextType}:${nodePath}`,
        name: segment,
        path: nodePath,
        type: nextType,
        children: [],
        fileId: isLeaf ? file.id : undefined,
      }

      cursor.children = [...cursor.children, next]
    }

    cursor = next
  }
}

function sortTree(node: FileTreeNode): FileTreeNode {
  const sortedChildren = [...node.children]
    .map((child) => sortTree(child))
    .sort((left, right) => {
      if (left.type !== right.type) {
        return left.type === 'folder' ? -1 : 1
      }

      return left.name.localeCompare(right.name)
    })

  return {
    ...node,
    children: sortedChildren,
  }
}

export function buildFileTree(files: FileDto[]): FileTreeNode {
  const root: FileTreeNode = {
    id: 'root',
    name: 'root',
    path: '',
    type: 'folder',
    children: [],
  }

  files.forEach((file) => {
    insertPath(root, file)
  })

  return sortTree(root)
}

export function filterFileTree(node: FileTreeNode, query: string): FileTreeNode | null {
  if (query.trim().length === 0) {
    return node
  }

  const lowered = query.toLowerCase()
  const childMatches = node.children
    .map((child) => filterFileTree(child, query))
    .filter((child): child is FileTreeNode => child !== null)

  const selfMatches = node.path.toLowerCase().includes(lowered)

  if (node.id === 'root') {
    return {
      ...node,
      children: childMatches,
    }
  }

  if (selfMatches || childMatches.length > 0) {
    return {
      ...node,
      children: childMatches,
    }
  }

  return null
}
