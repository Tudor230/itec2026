import {
  importSPKI,
  createRemoteJWKSet,
  decodeProtectedHeader,
  jwtVerify,
  type JWTVerifyOptions,
} from 'jose'

const encoder = new TextEncoder()

let cachedAuth0Domain: string | null = null
let cachedJwksResolver: ReturnType<typeof createRemoteJWKSet> | null = null
let cachedPublicKeyPem: string | null = null
let cachedPublicKey: Awaited<ReturnType<typeof importSPKI>> | null = null

function normalizeAuth0Domain(domain: string): string {
  const trimmedDomain = domain.trim()
  const withScheme = /^https?:\/\//i.test(trimmedDomain)
    ? trimmedDomain
    : `https://${trimmedDomain}`

  const parsed = new URL(withScheme)
  if (parsed.protocol !== 'https:') {
    throw new Error('AUTH0_DOMAIN must use https')
  }

  return `${parsed.protocol}//${parsed.host}`
}

function resolveAuth0VerificationOptions(): {
  domain: string
  options: JWTVerifyOptions
} | null {
  const rawDomain = process.env.AUTH0_DOMAIN?.trim()
  const audience = process.env.AUTH0_AUDIENCE?.trim()

  if (!rawDomain || !audience) {
    return null
  }

  const domain = normalizeAuth0Domain(rawDomain)
  const issuer = process.env.AUTH0_ISSUER?.trim() || `${domain}/`

  return {
    domain,
    options: {
      issuer,
      audience,
      algorithms: ['RS256'],
    },
  }
}

function getAuth0Jwks(domain: string) {
  if (cachedJwksResolver && cachedAuth0Domain === domain) {
    return cachedJwksResolver
  }

  cachedAuth0Domain = domain
  cachedJwksResolver = createRemoteJWKSet(new URL(`${domain}/.well-known/jwks.json`))
  return cachedJwksResolver
}

function resolveLocalVerificationOptions(): JWTVerifyOptions {
  const issuer = process.env.AUTH_JWT_ISSUER?.trim()
  const audience = process.env.AUTH_JWT_AUDIENCE?.trim()

  if (!issuer || !audience) {
    return {}
  }

  return {
    issuer,
    audience,
  }
}

async function verifyWithLocalKey(token: string) {
  const algorithm = decodeProtectedHeader(token).alg
  if (algorithm !== 'HS256' && algorithm !== 'RS256') {
    return null
  }

  const localOptions = resolveLocalVerificationOptions()
  if (!localOptions.issuer || !localOptions.audience) {
    return null
  }

  const hs256Secret = process.env.AUTH_JWT_HS256_SECRET?.trim()
  if (algorithm === 'HS256') {
    if (!hs256Secret) {
      return null
    }

    const verified = await jwtVerify(token, encoder.encode(hs256Secret), {
      ...localOptions,
      algorithms: ['HS256'],
    })

    return verified.payload
  }

  const publicKeyPem = process.env.AUTH_JWT_PUBLIC_KEY?.trim()
  if (!publicKeyPem) {
    return null
  }

  if (!cachedPublicKey || cachedPublicKeyPem !== publicKeyPem) {
    cachedPublicKeyPem = publicKeyPem
    cachedPublicKey = await importSPKI(publicKeyPem, 'RS256')
  }

  const verified = await jwtVerify(token, cachedPublicKey, {
    ...localOptions,
    algorithms: ['RS256'],
  })

  return verified.payload
}

async function verifyPayload(token: string) {
  const auth0Verification = resolveAuth0VerificationOptions()

  if (auth0Verification) {
    const verified = await jwtVerify(
      token,
      getAuth0Jwks(auth0Verification.domain),
      auth0Verification.options,
    )

    return verified.payload
  }

  return verifyWithLocalKey(token)
}

export async function subjectFromToken(token: string): Promise<string | null> {
  try {
    const payload = await verifyPayload(token)
    if (!payload || typeof payload.sub !== 'string') {
      return null
    }

    const subject = payload.sub.trim()
    return subject || null
  } catch {
    return null
  }
}
