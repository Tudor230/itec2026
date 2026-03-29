# TanStack Start + Auth0

This project keeps authentication inside a single TanStack Start app using React and the official Auth0 React SDK. A Phase 0 backend now exists for project/file APIs and real-time scaffolding, while auth enforcement remains client-side for now.

## Commands

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
```

## Local Auth0 Configuration

Copy `.env.example` to `.env` and fill in your Auth0 values.

```bash
Copy-Item .env.example .env
```

Environment variables:

```bash
VITE_API_BASE_URL=http://localhost:4000
VITE_AUTH0_DOMAIN=your-tenant.us.auth0.com
VITE_AUTH0_CLIENT_ID=your_auth0_client_id
VITE_AUTH0_REDIRECT_URI=http://localhost:3000
VITE_AUTH0_LOGOUT_RETURN_TO=http://localhost:3000
VITE_AUTH0_ROLES_CLAIM=https://your-app.example.com/roles
```

`VITE_AUTH0_ROLES_CLAIM` is optional. Use it if your Auth0 Action writes roles into a specific custom claim name and you want the app to read that claim explicitly.

## Required Auth0 Dashboard Settings

- Application type: Single Page Application
- Callback URL: `http://localhost:3000`
- Logout URL: `http://localhost:3000`
- Allowed Web Origins: `http://localhost:3000`

If you change the local dev port, update both the Auth0 dashboard values and the `.env` values to match.

## What Was Chosen And Why

- This repo already used the stable TanStack Start Vite plugin structure, so the app keeps that current file-based route layout instead of introducing a different scaffold shape.
- Auth0 React SDK v2+ uses `authorizationParams` and `logoutParams`, so this setup uses those current APIs instead of older top-level redirect options.
- Route protection remains handled in the client with the Auth0 React SDK for the current phase.
- Backend auth uses a boundary contract in Phase 0 (anonymous/token-present metadata only) so server-side verification can be added later with minimal changes.

## Folder Structure

```text
.
├── .env
├── .env.example
├── package.json
├── README.md
├── src
│   ├── auth
│   │   ├── AuthProvider.tsx
│   │   └── ProtectedRoute.tsx
│   ├── components
│   │   ├── auth
│   │   │   ├── AuthSetupNotice.tsx
│   │   │   ├── LoginButton.tsx
│   │   │   ├── LogoutButton.tsx
│   │   │   └── UserInfo.tsx
│   │   ├── Footer.tsx
│   │   ├── Header.tsx
│   │   └── ThemeToggle.tsx
│   ├── integrations
│   │   └── tanstack-query
│   ├── lib
│   │   ├── auth-claims.ts
│   │   ├── auth0-config.ts
│   │   └── utils.ts
│   ├── routes
│   │   ├── __root.tsx
│   │   ├── about.tsx
│   │   ├── dashboard.tsx
│   │   ├── index.tsx
│   │   └── demo
│   │       └── tanstack-query.tsx
│   ├── router.tsx
│   ├── styles.css
│   └── vite-env.d.ts
└── vite.config.ts
```

## How Authentication Works

- `src/auth/AuthProvider.tsx` mounts `Auth0Provider` once at the app root.
- `src/components/auth/LoginButton.tsx` starts login and stores the current route in `appState.returnTo`.
- `src/auth/AuthProvider.tsx` reads that stored `returnTo` value after login and sends the browser back to the intended route.
- `src/auth/ProtectedRoute.tsx` redirects unauthenticated users to Auth0 when they try to open `/dashboard`.
- `src/components/auth/UserInfo.tsx` reads the authenticated user from the Auth0 React SDK.

## Protecting Future Routes

Wrap the route content with `ProtectedRoute`:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import ProtectedRoute from '../auth/ProtectedRoute'

export const Route = createFileRoute('/settings')({
  component: Settings,
})

function Settings() {
  return (
    <ProtectedRoute>
      <main>Protected content</main>
    </ProtectedRoute>
  )
}
```

To require roles from Auth0 claims:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import ProtectedRoute from '../auth/ProtectedRoute'

export const Route = createFileRoute('/admin')({
  component: Admin,
})

function Admin() {
  return (
    <ProtectedRoute requiredRoles={['admin']}>
      <main>Admin-only content</main>
    </ProtectedRoute>
  )
}
```

The guard supports:

- `requiredRoles={['admin']}` to require one role
- `requiredRoles={['admin', 'editor']} match="any"` to allow either role
- `requiredRoles={['admin', 'billing']} match="all"` to require both roles

## Accessing Authenticated User Info

Use the `UserInfo` component for a ready-made UI, or read the Auth0 session directly in a component that is rendered inside `AuthProvider`:

```tsx
import { useAuth0 } from '@auth0/auth0-react'

export function ProfileSummary() {
  const { user, isAuthenticated } = useAuth0()

  if (!isAuthenticated || !user) {
    return null
  }

  return <p>{user.name}</p>
}
```

## Troubleshooting

- `Missing Auth0 environment variables`: fill in `.env` and restart `npm run dev`.
- `Login redirects back to the wrong URL`: make sure `VITE_AUTH0_REDIRECT_URI` matches the Auth0 callback URL exactly.
- `Logout does not return to localhost`: make sure `VITE_AUTH0_LOGOUT_RETURN_TO` is listed in Allowed Logout URLs.
- `Origin not allowed`: add `http://localhost:3000` to Allowed Web Origins.
- `Blank or error page after login`: confirm the Auth0 application is a Single Page Application and that the domain and client ID are correct.
