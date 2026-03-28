import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createHmac } from 'node:crypto'
import express from 'express'
import { authBoundaryMiddleware } from './auth-boundary.middleware.js'
import { requireTokenPresent } from './require-token-present.middleware.js'

const TEST_JWT_SECRET = 'test-jwt-secret'
process.env.AUTH_JWT_HS256_SECRET = TEST_JWT_SECRET
process.env.AUTH_JWT_ISSUER = 'https://issuer.test/'
process.env.AUTH_JWT_AUDIENCE = 'https://audience.test'

function createJwt(sub: string, jwtId: string) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(
    JSON.stringify({
      sub,
      jti: jwtId,
      iss: process.env.AUTH_JWT_ISSUER,
      aud: process.env.AUTH_JWT_AUDIENCE,
    }),
  ).toString('base64url')
  const signingInput = `${header}.${payload}`
  const signature = createHmac('sha256', TEST_JWT_SECRET)
    .update(signingInput)
    .digest('base64url')

  return `${signingInput}.${signature}`
}

async function startServer() {
  const app = express()
  app.use(authBoundaryMiddleware)

  app.get('/protected', requireTokenPresent, (_request, response) => {
    response.json({
      ok: true,
      data: {
        allowed: true,
      },
    })
  })

  const server = await new Promise<Server>((resolve) => {
    const started = app.listen(0, '127.0.0.1', () => resolve(started))
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Cannot determine auth test server address')
  }

  return {
    baseUrl: `http://127.0.0.1:${(address as AddressInfo).port}`,
    close: () => {
      return new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error)
            return
          }

          resolve()
        })
      })
    },
  }
}

describe('requireTokenPresent middleware', () => {
  let baseUrl = ''
  let closeServer: (() => Promise<void>) | undefined

  beforeEach(async () => {
    const started = await startServer()
    baseUrl = started.baseUrl
    closeServer = started.close
  })

  afterEach(async () => {
    if (closeServer) {
      await closeServer()
      closeServer = undefined
    }
  })

  it('blocks access when token is missing', async () => {
    const response = await fetch(`${baseUrl}/protected`)
    const payload = await response.json()

    assert.equal(response.status, 401)
    assert.equal(payload.ok, false)
    assert.equal(payload.error.code, 'AUTH_REQUIRED')
  })

  it('blocks access when authorization scheme is invalid', async () => {
    const response = await fetch(`${baseUrl}/protected`, {
      headers: {
        authorization: 'Token some-value',
      },
    })
    const payload = await response.json()

    assert.equal(response.status, 401)
    assert.equal(payload.ok, false)
    assert.equal(payload.error.code, 'AUTH_REQUIRED')
  })

  it('allows access when bearer token has stable subject', async () => {
    const token = createJwt('auth0|middleware-user', 'jwt-middleware')

    const response = await fetch(`${baseUrl}/protected`, {
      headers: {
        authorization: `Bearer ${token}`,
      },
    })
    const payload = await response.json()

    assert.equal(response.status, 200)
    assert.equal(payload.ok, true)
    assert.equal(payload.data.allowed, true)
  })

  it('blocks access when token has no subject claim', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
    const payload = Buffer.from(
      JSON.stringify({
        jti: 'jwt-no-subject',
        iss: process.env.AUTH_JWT_ISSUER,
        aud: process.env.AUTH_JWT_AUDIENCE,
      }),
    ).toString('base64url')
    const signingInput = `${header}.${payload}`
    const signature = createHmac('sha256', TEST_JWT_SECRET)
      .update(signingInput)
      .digest('base64url')
    const token = `${signingInput}.${signature}`

    const response = await fetch(`${baseUrl}/protected`, {
      headers: {
        authorization: `Bearer ${token}`,
      },
    })
    const responsePayload = await response.json()

    assert.equal(response.status, 401)
    assert.equal(responsePayload.ok, false)
    assert.equal(responsePayload.error.code, 'AUTH_REQUIRED')
  })
})
