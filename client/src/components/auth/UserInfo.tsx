import { useAuth0 } from '@auth0/auth0-react'
import { Link } from '@tanstack/react-router'
import { useAuthRuntime } from '../../auth/AuthProvider'
import { getUserRoles } from '../../lib/auth-claims'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Settings, Palette, User, LogOut, ChevronDown } from 'lucide-react'
import { cn } from '../../lib/utils'

interface UserInfoProps {
  compact?: boolean
  onLogout?: () => void
}

function AuthenticatedUserInfo({ compact = false, onLogout }: UserInfoProps) {
  const { isAuthenticated, isLoading, user, logout } = useAuth0()

  if (isLoading || !isAuthenticated || !user) {
    return null
  }

  const displayName = user.name || user.nickname || user.email || 'User'
  const email = user.email || ''
  const roles = getUserRoles(user)

  const handleLogout = () => {
    if (onLogout) {
      onLogout()
    } else {
      logout({ logoutParams: { returnTo: window.location.origin } })
    }
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className={cn(
            'flex items-center gap-2 p-1 pr-2 rounded-full border border-[var(--line)] bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(0,0,0,0.05)] transition-all outline-none',
            compact ? 'h-8' : 'h-10',
          )}
        >
          {user.picture ? (
            <img
              src={user.picture}
              alt={displayName}
              className={cn(
                'rounded-full object-cover',
                compact ? 'h-6 w-6' : 'h-8 w-8',
              )}
              referrerPolicy="no-referrer"
            />
          ) : (
            <div
              className={cn(
                'rounded-full bg-[var(--lagoon)] flex items-center justify-center text-white font-bold',
                compact ? 'h-6 w-6 text-[10px]' : 'h-8 w-8 text-xs',
              )}
            >
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
          {!compact && (
            <span className="text-xs font-bold text-[var(--sea-ink)] hidden sm:inline">
              {displayName.split(' ')[0]}
            </span>
          )}
          <ChevronDown size={12} className="text-[var(--sea-ink-soft)]" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-[100] min-w-[220px] bg-[rgba(var(--bg-rgb),0.8)] backdrop-blur-xl border border-[var(--line)] rounded-xl p-1 shadow-2xl animate-in fade-in zoom-in-95 duration-200 origin-top-right"
          sideOffset={8}
          align="end"
        >
          <div className="px-3 py-2 border-b border-[var(--line)] mb-1">
            <p className="text-xs font-extrabold text-[var(--sea-ink)] truncate">
              {displayName}
            </p>
            <p className="text-[10px] text-[var(--sea-ink-soft)] truncate">
              {email}
            </p>
            {roles.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {roles.map((role) => (
                  <span
                    key={role}
                    className="text-[8px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded-full bg-[rgba(var(--lagoon-rgb),0.1)] text-[var(--lagoon-deep)]"
                  >
                    {role}
                  </span>
                ))}
              </div>
            )}
          </div>

          <DropdownMenu.Item asChild>
            <Link
              to="/profile/account"
              className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)] hover:bg-[rgba(0,0,0,0.05)] rounded-lg outline-none cursor-pointer transition-colors no-underline"
            >
              <User size={14} />
              Account Info
            </Link>
          </DropdownMenu.Item>

          <DropdownMenu.Item asChild>
            <Link
              to="/profile/settings"
              className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)] hover:bg-[rgba(0,0,0,0.05)] rounded-lg outline-none cursor-pointer transition-colors no-underline"
            >
              <Settings size={14} />
              Settings
            </Link>
          </DropdownMenu.Item>

          <DropdownMenu.Item asChild>
            <Link
              to="/profile/theme"
              className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)] hover:bg-[rgba(0,0,0,0.05)] rounded-lg outline-none cursor-pointer transition-colors no-underline"
            >
              <Palette size={14} />
              Theme
            </Link>
          </DropdownMenu.Item>

          <DropdownMenu.Separator className="h-[1px] bg-[var(--line)] my-1" />

          <DropdownMenu.Item
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-red-500 hover:text-red-600 hover:bg-red-50 rounded-lg outline-none cursor-pointer transition-colors"
          >
            <LogOut size={14} />
            Logout
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

export default function UserInfo(props: UserInfoProps) {
  const { isConfigured } = useAuthRuntime()

  if (!isConfigured) {
    return null
  }

  return <AuthenticatedUserInfo {...props} />
}
