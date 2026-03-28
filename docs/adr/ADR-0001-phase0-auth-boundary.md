# ADR-0001: Phase 0 Auth Boundary While Keeping Client-Side Auth

## Status

Accepted

## Context

Phase 0 requires backend bootstrap and API wiring while the current product already uses Auth0 in the client as the primary auth UX. We need to keep existing client-side auth behavior unchanged and still prepare the backend for server-side auth later.

## Decision

For Phase 0, the backend introduces an auth boundary contract and verifies bearer JWTs using Auth0 JWKS before trusting identity claims.

- HTTP requests pass through middleware that resolves `ActorContext` as:
  - `anonymous` when no bearer token is present
  - `token_present` when bearer token signature/claims are valid and token includes a non-empty `sub` claim
- Socket.IO handshake uses the same principle and emits actor type for observability.
- All modules accept `ActorContext` in service/repository signatures.
- Ownership fields (`owner_subject`) store the stable user identity from token `sub` instead of a token-derived hash.
- Write routes require stable subject presence (`token_present` with `subject`) to reduce accidental anonymous writes in this phase.
- Verification uses Auth0 JWKS at `https://<AUTH0_DOMAIN>/.well-known/jwks.json` with issuer/audience checks.

Client-side Auth0 behavior remains unchanged.

## Consequences

### Positive

- No user-facing auth flow changes in Phase 0.
- Minimal future migration cost to server-side auth by replacing boundary internals.
- Clear separation between token presence and trusted authentication.

### Negative

- Token parsing without verification is not trusted; identity is accepted only after successful JWT verification.
- Tokens without `sub` are treated as anonymous and rejected by protected routes.
- Legacy rows saved with token-derived ownership before this ADR update are intentionally left untouched and may not be reachable after cutover.

## Follow-up

When role/claim-based authorization is enabled:

1. Extend verified payload mapping from `sub` to additional claims/roles.
2. Emit `authenticated` `ActorContext` with trusted roles/permissions.
3. Enforce route-level authorization using existing `ActorContext` plumbing.
