import { Auth0Provider, type AppState } from '@auth0/auth0-react'
import { createContext, useContext, type ReactNode } from 'react'
import { auth0Config, isAuth0Configured, sanitizeReturnToPath } from '../lib/auth0-config'

interface AuthRuntimeContextValue {
  isConfigured: boolean
}

const AuthRuntimeContext = createContext<AuthRuntimeContextValue>({
  isConfigured: isAuth0Configured,
})

function onRedirectCallback(appState?: AppState) {
  if (typeof window === 'undefined') {
    return
  }

  const rawReturnTo =
    typeof appState?.returnTo === 'string' ? appState.returnTo : '/projects'
  const returnTo = sanitizeReturnToPath(rawReturnTo, '/projects')
  window.location.replace(returnTo)
}

export function useAuthRuntime() {
  return useContext(AuthRuntimeContext)
}

export default function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <AuthRuntimeContext.Provider value={{ isConfigured: isAuth0Configured }}>
      {isAuth0Configured ? (
        <Auth0Provider
          domain={auth0Config.domain}
          clientId={auth0Config.clientId}
          authorizationParams={{
            redirect_uri: auth0Config.redirectUri,
            audience: auth0Config.audience,
          }}
          onRedirectCallback={onRedirectCallback}
          cacheLocation="localstorage"
          useRefreshTokens={true}
        >
          {children}
        </Auth0Provider>
      ) : (
        children
      )}
    </AuthRuntimeContext.Provider>
  )
}
