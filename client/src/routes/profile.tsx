import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/profile')({
  beforeLoad: ({ location }) => {
    if (location.pathname === '/profile') {
      throw redirect({ to: '/profile/account', replace: true })
    }
  },
  component: ProfileRoute,
})

function ProfileRoute() {
  return <Outlet />
}
