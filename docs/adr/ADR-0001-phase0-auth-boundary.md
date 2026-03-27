# ADR-0001: Phase 0 Auth Boundary While Keeping Client-Side Auth

## Status

Accepted

## Context

Phase 0 requires backend bootstrap and API wiring while the current product already uses Auth0 in the client as the primary auth UX. We need to keep existing client-side auth behavior unchanged and still prepare the backend for server-side auth later.

## Decision

For Phase 0, the backend introduces an auth boundary contract but does not enforce Auth0 JWT verification yet.

- HTTP requests pass through middleware that resolves `ActorContext` as:
  - `anonymous` when no bearer token is present
  - `token_present` when bearer token exists but is not validated
- Socket.IO handshake uses the same principle and emits actor type for observability.
- All modules accept `ActorContext` in service/repository signatures.
- Ownership fields (`owner_subject`) are included in schema as nullable columns for future per-user enforcement.
- Write routes require at least token presence (`token_present`) to reduce accidental anonymous writes in this phase.

Client-side Auth0 behavior remains unchanged.

## Consequences

### Positive

- No user-facing auth flow changes in Phase 0.
- Minimal future migration cost to server-side auth by replacing boundary internals.
- Clear separation between token presence and trusted authentication.

### Negative

- Token-presence checks are not real authentication and must not be treated as authorization.

## Follow-up

When server-side auth is enabled:

1. Replace boundary token parsing with Auth0 JWT verification middleware.
2. Emit `authenticated` `ActorContext` with trusted `subject` and claims.
3. Enforce route and ownership authorization using existing `ActorContext` plumbing.
