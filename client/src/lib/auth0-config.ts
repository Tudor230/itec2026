const DEFAULT_APP_URL = 'http://localhost:3000'

function readEnvValue(value: string | undefined) {
  return value?.trim() ?? ''
}

export const auth0Config = {
  domain: readEnvValue(import.meta.env.VITE_AUTH0_DOMAIN),
  clientId: readEnvValue(import.meta.env.VITE_AUTH0_CLIENT_ID),
  redirectUri:
    readEnvValue(import.meta.env.VITE_AUTH0_REDIRECT_URI) || DEFAULT_APP_URL,
  logoutReturnTo:
    readEnvValue(import.meta.env.VITE_AUTH0_LOGOUT_RETURN_TO) ||
    DEFAULT_APP_URL,
}

export const missingAuth0EnvVars = [
  !auth0Config.domain ? 'VITE_AUTH0_DOMAIN' : null,
  !auth0Config.clientId ? 'VITE_AUTH0_CLIENT_ID' : null,
  !auth0Config.redirectUri ? 'VITE_AUTH0_REDIRECT_URI' : null,
  !auth0Config.logoutReturnTo ? 'VITE_AUTH0_LOGOUT_RETURN_TO' : null,
].filter((value): value is string => value !== null)

export const isAuth0Configured = missingAuth0EnvVars.length === 0

export function sanitizeReturnToPath(returnTo: string | undefined, fallback = '/') {
  if (!returnTo) {
    return fallback
  }

  const trimmed = returnTo.trim()

  if (!trimmed.startsWith('/')) {
    return fallback
  }

  if (trimmed.startsWith('//')) {
    return fallback
  }

  return trimmed
}

export function getCurrentReturnTo(fallback = '/') {
  if (typeof window === 'undefined') {
    return fallback
  }

  const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`
  return returnTo || fallback
}
