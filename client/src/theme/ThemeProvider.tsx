import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  applyThemePreset,
  getStoredThemePreset,
  persistThemePreset,
  resolveThemePreset,
  THEME_STORAGE_KEY,
  THEME_PRESETS,
  type ThemePreset,
  type ThemePresetId,
} from '../lib/theme'

interface ThemeContextValue {
  preset: ThemePresetId
  presets: readonly ThemePreset[]
  setPreset: (preset: ThemePresetId) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preset, setPresetState] = useState<ThemePresetId>(() => getStoredThemePreset())

  const setPreset = useCallback((nextPreset: ThemePresetId) => {
    setPresetState(resolveThemePreset(nextPreset))
  }, [])

  useEffect(() => {
    applyThemePreset(preset)
    persistThemePreset(preset)
  }, [preset])

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) {
        return
      }

      setPresetState(resolveThemePreset(event.newValue))
    }

    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  const value = useMemo(
    () => ({
      preset,
      presets: THEME_PRESETS,
      setPreset,
    }),
    [preset, setPreset],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useThemePreset() {
  const context = useContext(ThemeContext)

  if (context === null) {
    throw new Error('useThemePreset must be used within ThemeProvider.')
  }

  return context
}
