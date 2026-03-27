/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_AUTH0_DOMAIN?: string
  readonly VITE_AUTH0_CLIENT_ID?: string
  readonly VITE_AUTH0_AUDIENCE?: string
  readonly VITE_AUTH0_REDIRECT_URI?: string
  readonly VITE_AUTH0_LOGOUT_RETURN_TO?: string
  readonly VITE_AUTH0_ROLES_CLAIM?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
