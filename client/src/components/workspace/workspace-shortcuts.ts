export type WorkspaceShortcut =
  | 'save'
  | 'quick-open'
  | 'toggle-sidebar'
  | 'toggle-terminal'
  | 'command-palette'
  | null

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') {
    return false
  }

  const element = target as {
    tagName?: string
    isContentEditable?: boolean
  }

  const tagName = element.tagName

  return (
    tagName === 'INPUT' ||
    tagName === 'TEXTAREA' ||
    element.isContentEditable === true
  )
}

export function getWorkspaceShortcut(event: {
  ctrlKey: boolean
  metaKey: boolean
  key: string
  code: string
  target: EventTarget | null
}): WorkspaceShortcut {
  if (!(event.ctrlKey || event.metaKey)) {
    return null
  }

  if (isEditableTarget(event.target)) {
    return null
  }

  const key = event.key.toLowerCase()

  if (key === 's') {
    return 'save'
  }

  if (key === 'p') {
    return 'quick-open'
  }

  if (key === 'b') {
    return 'toggle-sidebar'
  }

  if (event.code === 'Backquote') {
    return 'toggle-terminal'
  }

  if (event.code === 'Slash') {
    return 'command-palette'
  }

  return null
}
