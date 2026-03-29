const COLLABORATOR_COLORS = [
  '#0EA5E9',
  '#22C55E',
  '#F97316',
  '#E11D48',
  '#8B5CF6',
  '#14B8A6',
  '#F59E0B',
  '#3B82F6',
] as const

function hashString(value: string): number {
  let hash = 0

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index)
    hash |= 0
  }

  return Math.abs(hash)
}

export function getCollaboratorColor(key: string): string {
  if (!key.trim()) {
    return COLLABORATOR_COLORS[0]
  }

  const index = hashString(key) % COLLABORATOR_COLORS.length
  return COLLABORATOR_COLORS[index]
}

export function getCollaboratorClassSuffix(key: string): string {
  return `collab-${hashString(key).toString(36)}`
}
