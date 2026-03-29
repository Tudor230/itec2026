export type ThemePresetId =
  | 'light'
  | 'dark'
  | 'dracula'
  | 'nord'
  | 'solarized'
  | 'midnight'

export interface ThemePreset {
  id: ThemePresetId
  label: string
  description: string
  swatch: string
  colorScheme: 'light' | 'dark'
}

export const THEME_STORAGE_KEY = 'themePreset'
export const DEFAULT_THEME_PRESET: ThemePresetId = 'light'

export const THEME_PRESETS: readonly ThemePreset[] = [
  {
    id: 'light',
    label: 'Light IDE',
    description: 'Bright canvas with teal accents.',
    swatch: 'linear-gradient(120deg, #e9f6ef, #4fb8b2)',
    colorScheme: 'light',
  },
  {
    id: 'dark',
    label: 'Dark IDE',
    description: 'Neutral dark workspace with soft contrast.',
    swatch: 'linear-gradient(120deg, #0d1a1f, #67d7cb)',
    colorScheme: 'dark',
  },
  {
    id: 'dracula',
    label: 'Dracula',
    description: 'Vibrant dark palette for late sessions.',
    swatch: 'linear-gradient(120deg, #1f1d2b, #ff79c6)',
    colorScheme: 'dark',
  },
  {
    id: 'nord',
    label: 'Nord',
    description: 'Cool blue-gray theme with crisp text.',
    swatch: 'linear-gradient(120deg, #202b3b, #88c0d0)',
    colorScheme: 'dark',
  },
  {
    id: 'solarized',
    label: 'Solarized',
    description: 'Warm tan background with balanced contrast.',
    swatch: 'linear-gradient(120deg, #fdf6e3, #268bd2)',
    colorScheme: 'light',
  },
  {
    id: 'midnight',
    label: 'Midnight',
    description: 'Deep navy palette tuned for focus.',
    swatch: 'linear-gradient(120deg, #091322, #3f84e5)',
    colorScheme: 'dark',
  },
] as const

export const THEME_PRESET_IDS = THEME_PRESETS.map((preset) => preset.id)

const THEME_COLOR_SCHEMES: Record<ThemePresetId, 'light' | 'dark'> =
  THEME_PRESETS.reduce(
    (accumulator, preset) => ({
      ...accumulator,
      [preset.id]: preset.colorScheme,
    }),
    {} as Record<ThemePresetId, 'light' | 'dark'>,
  )

function isThemePresetId(value: string): value is ThemePresetId {
  return THEME_PRESET_IDS.includes(value as ThemePresetId)
}

export function resolveThemePreset(
  value: string | null | undefined,
): ThemePresetId {
  if (!value) {
    return DEFAULT_THEME_PRESET
  }

  return isThemePresetId(value) ? value : DEFAULT_THEME_PRESET
}

export function getStoredThemePreset(): ThemePresetId {
  if (typeof window === 'undefined') {
    return DEFAULT_THEME_PRESET
  }

  const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
  return resolveThemePreset(stored)
}

export function applyThemePreset(presetId: ThemePresetId) {
  if (typeof document === 'undefined') {
    return
  }

  const root = document.documentElement
  root.setAttribute('data-theme', presetId)
  root.style.colorScheme = THEME_COLOR_SCHEMES[presetId]
}

export function persistThemePreset(presetId: ThemePresetId) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(THEME_STORAGE_KEY, presetId)
}

const presetIdsLiteral = JSON.stringify(THEME_PRESET_IDS)
const colorSchemesLiteral = JSON.stringify(THEME_COLOR_SCHEMES)

export const THEME_INIT_SCRIPT = `(function(){try{var ids=${presetIdsLiteral};var schemes=${colorSchemesLiteral};var fallback='${DEFAULT_THEME_PRESET}';var stored=window.localStorage.getItem('${THEME_STORAGE_KEY}');var next=ids.indexOf(stored)!==-1?stored:fallback;var root=document.documentElement;root.setAttribute('data-theme',next);root.style.colorScheme=schemes[next]||'light';}catch(e){}})();`
