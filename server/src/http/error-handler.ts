import type { NextFunction, Request, Response } from 'express'

interface DbLikeError extends Error {
  code?: string
}

function asDbLikeError(error: unknown): DbLikeError | null {
  if (error instanceof Error) {
    return error as DbLikeError
  }

  return null
}

function mapStatusCode(error: DbLikeError | null) {
  if (!error?.code) {
    return 500
  }

  if (error.code === 'AUTH_REQUIRED') {
    return 401
  }

  if (error.code === 'P2002' || error.code === '23505') {
    return 409
  }

  if (error.code === 'P2003' || error.code === '23503' || error.code === '22P02') {
    return 400
  }

  if (error.code === 'P2025') {
    return 404
  }

  return 500
}

function mapErrorCode(error: DbLikeError | null) {
  if (!error?.code) {
    return 'INTERNAL_ERROR'
  }

  if (error.code === 'AUTH_REQUIRED') {
    return 'AUTH_REQUIRED'
  }

  if (error.code === 'P2002' || error.code === '23505') {
    return 'DUPLICATE_RESOURCE'
  }

  if (error.code === 'P2003' || error.code === '23503') {
    return 'INVALID_REFERENCE'
  }

  if (error.code === '22P02') {
    return 'INVALID_INPUT'
  }

  if (error.code === 'P2025') {
    return 'RESOURCE_NOT_FOUND'
  }

  return 'INTERNAL_ERROR'
}

function mapMessage(statusCode: number, error: DbLikeError | null) {
  if (statusCode === 401) {
    return 'Authentication is required'
  }

  if (statusCode === 409) {
    return 'Resource already exists'
  }

  if (statusCode === 400) {
    return 'Invalid request data'
  }

  if (statusCode === 404) {
    return 'Resource not found'
  }

  if (statusCode >= 500) {
    return 'Unexpected server error'
  }

  const fallback = error?.message?.trim()
  return fallback || 'Unexpected server error'
}

export function errorHandler(
  error: unknown,
  _request: Request,
  response: Response,
  _next: NextFunction,
) {
  const dbLikeError = asDbLikeError(error)
  const statusCode = mapStatusCode(dbLikeError)
  const code = mapErrorCode(dbLikeError)
  const message = mapMessage(statusCode, dbLikeError)

  if (statusCode >= 500) {
    console.error('Unhandled route error', error)
  }

  response.status(statusCode).json({
    ok: false,
    error: {
      code,
      message,
    },
  })
}
