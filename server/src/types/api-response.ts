export interface ApiSuccessResponse<T> {
  ok: true
  data: T
}

export interface ApiErrorResponse {
  ok: false
  error: {
    message: string
    code?: string
  }
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse
