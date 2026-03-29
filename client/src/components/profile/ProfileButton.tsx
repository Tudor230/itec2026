import UserInfo from '../auth/UserInfo'
import { useAuthRuntime } from '../../auth/AuthProvider'

interface ProfileButtonProps {
  compact?: boolean
  onLogout?: () => void
}

export default function ProfileButton({
  compact,
  onLogout,
}: ProfileButtonProps) {
  const { isConfigured } = useAuthRuntime()

  if (!isConfigured) {
    return null
  }

  return <UserInfo compact={compact} onLogout={onLogout} />
}
