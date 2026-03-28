import type { Request, Response } from 'express'

export function notFoundHandler(_request: Request, response: Response) {
  response.status(404).json({
    ok: false,
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: 'Route not found',
    },
  })
}
