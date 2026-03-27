import type { User } from '@auth0/auth0-react'

function readArrayClaim(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((item): item is string => typeof item === 'string')
}

function getConfiguredRolesClaimKey() {
  const configuredClaimKey = import.meta.env.VITE_AUTH0_ROLES_CLAIM?.trim()
  return configuredClaimKey || null
}

function getNamespacedRolesClaim(user: User | undefined) {
  if (!user) {
    return []
  }

  for (const [key, value] of Object.entries(user)) {
    if (key.endsWith('/roles') || key.endsWith(':roles')) {
      const roles = readArrayClaim(value)
      if (roles.length > 0) {
        return roles
      }
    }
  }

  return []
}

export function getUserRoles(user: User | undefined) {
  const configuredClaimKey = getConfiguredRolesClaimKey()

  if (configuredClaimKey) {
    const configuredRoles = readArrayClaim(user?.[configuredClaimKey])
    if (configuredRoles.length > 0) {
      return configuredRoles
    }
  }

  const directRoles = readArrayClaim(user?.roles)
  if (directRoles.length > 0) {
    return directRoles
  }

  return getNamespacedRolesClaim(user)
}

export function hasRequiredRoles(
  userRoles: string[],
  requiredRoles: string[],
  match: 'all' | 'any' = 'all',
) {
  if (requiredRoles.length === 0) {
    return true
  }

  return match === 'all'
    ? requiredRoles.every((role) => userRoles.includes(role))
    : requiredRoles.some((role) => userRoles.includes(role))
}