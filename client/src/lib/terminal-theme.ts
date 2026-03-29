import type { ThemePresetId } from './theme'

export interface TerminalThemeColors {
  background: string
  foreground: string
  cursor: string
  cursorAccent: string
  selectionBackground: string
}

const TERMINAL_THEME_BY_PRESET: Record<ThemePresetId, TerminalThemeColors> = {
  light: {
    background: '#eef7f5',
    foreground: '#1b3b3f',
    cursor: '#2f8f97',
    cursorAccent: '#eef7f5',
    selectionBackground: 'rgba(50, 143, 151, 0.24)',
  },
  dark: {
    background: '#08161c',
    foreground: '#d2f3ee',
    cursor: '#8ce0d4',
    cursorAccent: '#08161c',
    selectionBackground: 'rgba(140, 224, 212, 0.3)',
  },
  dracula: {
    background: '#181428',
    foreground: '#f1efff',
    cursor: '#ff79c6',
    cursorAccent: '#181428',
    selectionBackground: 'rgba(255, 121, 198, 0.28)',
  },
  nord: {
    background: '#121b28',
    foreground: '#e4edf7',
    cursor: '#88c0d0',
    cursorAccent: '#121b28',
    selectionBackground: 'rgba(136, 192, 208, 0.28)',
  },
  solarized: {
    background: '#fdf5e3',
    foreground: '#204f5d',
    cursor: '#268bd2',
    cursorAccent: '#fdf5e3',
    selectionBackground: 'rgba(38, 139, 210, 0.24)',
  },
  midnight: {
    background: '#0b1426',
    foreground: '#e7efff',
    cursor: '#5d9dff',
    cursorAccent: '#0b1426',
    selectionBackground: 'rgba(93, 157, 255, 0.28)',
  },
}

export function resolveTerminalTheme(preset: ThemePresetId): TerminalThemeColors {
  return TERMINAL_THEME_BY_PRESET[preset]
}
