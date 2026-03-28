import { useThemePreset } from '../../theme/ThemeProvider'

interface ThemePresetPickerProps {
  compact?: boolean
}

export default function ThemePresetPicker({ compact = false }: ThemePresetPickerProps) {
  const { preset, presets, setPreset } = useThemePreset()

  return (
    <div className={`grid ${compact ? 'grid-cols-2 gap-2' : 'grid-cols-1 gap-2 sm:grid-cols-2'}`}>
      {presets.map((themePreset) => {
        const isActive = themePreset.id === preset

        return (
          <button
            key={themePreset.id}
            type="button"
            onClick={() => setPreset(themePreset.id)}
            aria-pressed={isActive}
            className={`rounded-xl border px-3 py-2 text-left transition ${
              isActive
                ? 'border-[rgba(50,143,151,0.45)] bg-[rgba(79,184,178,0.16)]'
                : 'border-[var(--chip-line)] bg-[var(--chip-bg)] hover:border-[rgba(50,143,151,0.32)]'
            }`}
          >
            <span className="mb-2 inline-block h-2.5 w-full rounded-full" style={{ background: themePreset.swatch }} />
            <span className="block text-sm font-semibold text-[var(--sea-ink)]">{themePreset.label}</span>
            <span className="block text-xs text-[var(--sea-ink-soft)]">{themePreset.description}</span>
          </button>
        )
      })}
    </div>
  )
}
