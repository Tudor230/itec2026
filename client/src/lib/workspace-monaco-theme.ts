import type { ThemePresetId } from './theme'

const isDefined = new Set<ThemePresetId>()

export function getMonacoThemeForPreset(preset: ThemePresetId) {
  if (preset === 'light') {
    return 'vs'
  }

  return `itec-${preset}`
}

function defineOneMonacoTheme(monaco: typeof import('monaco-editor'), preset: ThemePresetId) {
  if (isDefined.has(preset)) {
    return
  }

  if (preset === 'light') {
    isDefined.add(preset)
    return
  }

  switch (preset) {
    case 'dark':
      monaco.editor.defineTheme('itec-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [
          { token: 'comment', foreground: '7EA8A4' },
          { token: 'keyword', foreground: '5FD4CD' },
          { token: 'string', foreground: '9CD7AE' },
          { token: 'number', foreground: '8DE5DB' },
        ],
        colors: {
          'editor.background': '#0C171C',
          'editor.foreground': '#D7ECE8',
          'editorLineNumber.foreground': '#6A9A95',
          'editorLineNumber.activeForeground': '#AEE7E0',
          'editor.lineHighlightBackground': '#10242A',
          'editor.selectionBackground': '#1D4A4F',
          'editor.inactiveSelectionBackground': '#173B40',
          'editorCursor.foreground': '#8DE5DB',
        },
      })
      break
    case 'dracula':
      monaco.editor.defineTheme('itec-dracula', {
        base: 'vs-dark',
        inherit: true,
        rules: [
          { token: 'comment', foreground: '847FAD' },
          { token: 'keyword', foreground: 'FF79C6' },
          { token: 'string', foreground: '50FA7B' },
          { token: 'number', foreground: 'BD93F9' },
        ],
        colors: {
          'editor.background': '#151325',
          'editor.foreground': '#F1EFFF',
          'editorLineNumber.foreground': '#8076AC',
          'editorLineNumber.activeForeground': '#E4D7FF',
          'editor.lineHighlightBackground': '#1D1A31',
          'editor.selectionBackground': '#4A3263',
          'editor.inactiveSelectionBackground': '#362A4C',
          'editorCursor.foreground': '#FF8FD2',
        },
      })
      break
    case 'nord':
      monaco.editor.defineTheme('itec-nord', {
        base: 'vs-dark',
        inherit: true,
        rules: [
          { token: 'comment', foreground: '7E96B2' },
          { token: 'keyword', foreground: '88C0D0' },
          { token: 'string', foreground: 'A3BE8C' },
          { token: 'number', foreground: 'B48EAD' },
        ],
        colors: {
          'editor.background': '#111B2A',
          'editor.foreground': '#DFE7F2',
          'editorLineNumber.foreground': '#738DAF',
          'editorLineNumber.activeForeground': '#BDD0EA',
          'editor.lineHighlightBackground': '#1A2637',
          'editor.selectionBackground': '#2D4E66',
          'editor.inactiveSelectionBackground': '#253F53',
          'editorCursor.foreground': '#94D7EB',
        },
      })
      break
    case 'midnight':
      monaco.editor.defineTheme('itec-midnight', {
        base: 'vs-dark',
        inherit: true,
        rules: [
          { token: 'comment', foreground: '6E86B6' },
          { token: 'keyword', foreground: '7FB4FF' },
          { token: 'string', foreground: '6AC7FF' },
          { token: 'number', foreground: 'A7BFFF' },
        ],
        colors: {
          'editor.background': '#0A1322',
          'editor.foreground': '#E3ECFF',
          'editorLineNumber.foreground': '#637CAD',
          'editorLineNumber.activeForeground': '#BFD3FF',
          'editor.lineHighlightBackground': '#132036',
          'editor.selectionBackground': '#29497A',
          'editor.inactiveSelectionBackground': '#223D66',
          'editorCursor.foreground': '#7FB4FF',
        },
      })
      break
    case 'solarized':
      monaco.editor.defineTheme('itec-solarized', {
        base: 'vs',
        inherit: true,
        rules: [
          { token: 'comment', foreground: '8A9A9B' },
          { token: 'keyword', foreground: '268BD2' },
          { token: 'string', foreground: '859900' },
          { token: 'number', foreground: 'B58900' },
        ],
        colors: {
          'editor.background': '#F7EFDC',
          'editor.foreground': '#164253',
          'editorLineNumber.foreground': '#8C9A99',
          'editorLineNumber.activeForeground': '#4F6D78',
          'editor.lineHighlightBackground': '#EFE6D1',
          'editor.selectionBackground': '#CFDCE2',
          'editor.inactiveSelectionBackground': '#E3EBEF',
          'editorCursor.foreground': '#268BD2',
        },
      })
      break
    default:
      break
  }

  isDefined.add(preset)
}

export function defineMonacoThemes(monaco: typeof import('monaco-editor')) {
  defineOneMonacoTheme(monaco, 'light')
  defineOneMonacoTheme(monaco, 'dark')
  defineOneMonacoTheme(monaco, 'dracula')
  defineOneMonacoTheme(monaco, 'nord')
  defineOneMonacoTheme(monaco, 'solarized')
  defineOneMonacoTheme(monaco, 'midnight')
}
