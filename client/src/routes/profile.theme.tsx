import { createFileRoute } from '@tanstack/react-router'
import ProtectedRoute from '../auth/ProtectedRoute'
import ProfilePageFrame from '../components/profile/ProfilePageFrame'
import ThemePresetPicker from '../components/profile/ThemePresetPicker'

export const Route = createFileRoute('/profile/theme')({
  component: ProfileThemeRoute,
})

function ProfileThemeRoute() {
  return (
    <ProtectedRoute>
      <ProfilePageFrame
        title="Theme"
        description="Choose your preferred visual preset for the workspace and app surfaces."
      >
        <section className="rounded-2xl border border-[var(--line)] bg-[var(--chip-bg)] p-5">
          <p className="mb-2 text-[0.69rem] font-bold uppercase tracking-[0.16em] text-[var(--kicker)]">
            Editor and UI Presets
          </p>
          <ThemePresetPicker />
        </section>
      </ProfilePageFrame>
    </ProtectedRoute>
  )
}
