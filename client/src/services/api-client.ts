import { apiConfig } from '../lib/api-config'

interface ApiErrorPayload {
  message?: string
}

interface ApiErrorResponse {
  ok: false
  error?: ApiErrorPayload
}

interface ApiSuccessResponse<T> {
  ok: true
  data: T
}

type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse

interface ApiClientOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  accessToken?: string | null
}

function buildHeaders(options: ApiClientOptions) {
  const baseHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (options.accessToken && options.accessToken.trim().length > 0) {
    return {
      ...baseHeaders,
      Authorization: `Bearer ${options.accessToken}`,
    }
  }

  return baseHeaders
}

export async function apiRequest<T>(
  path: string,
  options: ApiClientOptions = {},
): Promise<T> {
  const method = options.method ?? 'GET'
  const response = await fetch(`${apiConfig.baseUrl}${path}`, {
    method,
    headers: buildHeaders(options),
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })

  const payload = (await response.json().catch(() => null)) as ApiResponse<T> | null

  if (!payload) {
    throw new Error('Server returned an invalid response')
  }

  if (!response.ok || !payload.ok) {
    const message = payload.ok ? 'Request failed' : (payload.error?.message ?? 'Request failed')
    throw new Error(message)
  }

  return payload.data
}
