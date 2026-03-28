import { useAuth0 } from '@auth0/auth0-react'
import { useAuthRuntime } from '../../auth/AuthProvider'
import { auth0Config } from '../../lib/auth0-config'

interface LoginButtonProps {
  label?: string
  className?: string
}

const defaultClassName =
  'rounded-full border border-[rgba(50,143,151,0.3)] bg-[rgba(79,184,178,0.14)] px-4 py-2 text-sm font-semibold text-[var(--lagoon-deep)] no-underline transition hover:-translate-y-0.5 hover:bg-[rgba(79,184,178,0.24)] disabled:cursor-not-allowed disabled:opacity-60'

function AuthenticatedLoginButton({
  label = 'Log in',
  className = defaultClassName,
}: LoginButtonProps) {
  const { isLoading, loginWithRedirect } = useAuth0()

  function handleLogin() {
    void loginWithRedirect({
      appState: {
        returnTo: '/projects',
      },
      authorizationParams: {
        redirect_uri: auth0Config.redirectUri,
      },
    })
  }

  return (
    <button
      type="button"
      onClick={handleLogin}
      disabled={isLoading}
      className={className}
    >
      {isLoading ? 'Loading...' : label}
    </button>
  )
}

export default function LoginButton(props: LoginButtonProps) {
  const { isConfigured } = useAuthRuntime()

  if (!isConfigured) {
    return (
      <button
        type="button"
        disabled
        className={props.className ?? defaultClassName}
        title="Set your Auth0 environment variables in .env first."
      >
        {props.label ?? 'Log in'}
      </button>
    )
  }

  return <AuthenticatedLoginButton {...props} />
}
