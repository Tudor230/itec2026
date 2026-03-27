const DEFAULT_API_BASE_URL = 'http://localhost:4000'

function readEnvValue(value: string | undefined) {
  return value?.trim() ?? ''
}

export const apiConfig = {
  baseUrl: readEnvValue(import.meta.env.VITE_API_BASE_URL) || DEFAULT_API_BASE_URL,
}
