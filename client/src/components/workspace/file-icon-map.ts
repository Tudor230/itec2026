const EXTENSION_ALIASES: Record<string, string> = {
  '.c++': '.cpp',
  '.doc': '.docx',
  '.xls': '.xlsx',
}

export const FILE_ICON_KEYS = [
  'SiC',
  'SiCplusplus',
  'SiTypescript',
  'SiReact',
  'SiJavascript',
  'SiPython',
  'FaJava',
  'SiGoogledocs',
  'SiGooglesheets',
  'FaFilePdf',
  'SiReadthedocs',
  'SiGitforwindows',
] as const

export type FileIconKey = (typeof FILE_ICON_KEYS)[number]

const EXTENSION_ICON_KEY_MAP: Record<string, FileIconKey> = {
  '.c': 'SiC',
  '.cpp': 'SiCplusplus',
  '.ts': 'SiTypescript',
  '.tsx': 'SiReact',
  '.js': 'SiJavascript',
  '.jsx': 'SiReact',
  '.py': 'SiPython',
  '.java': 'FaJava',
  '.docx': 'SiGoogledocs',
  '.xlsx': 'SiGooglesheets',
  '.pdf': 'FaFilePdf',
  '.txt': 'SiReadthedocs',
  '.bat': 'SiGitforwindows',
}

const EXTENSION_COLOR_MAP: Record<string, string> = {
  '.c': '#00599C',
  '.cpp': '#00599C',
  '.ts': '#3178C6',
  '.tsx': '#61DAFB',
  '.js': '#F7DF1E',
  '.jsx': '#61DAFB',
  '.py': '#3776AB',
  '.java': '#EA2D2E',
  '.docx': '#2B579A',
  '.xlsx': '#217346',
  '.pdf': '#E02028',
  '.txt': '#5B6571',
  '.bat': '#0078D4',
}

export interface FileIconMeta {
  extension: string | null
  iconKey: FileIconKey | null
  color: string | null
}

export function getFileExtension(fileName: string): string | null {
  const leafName = fileName.split('/').pop()?.trim() ?? ''
  if (!leafName) {
    return null
  }

  const dotIndex = leafName.lastIndexOf('.')
  if (dotIndex <= 0 || dotIndex === leafName.length - 1) {
    return null
  }

  return leafName.slice(dotIndex).toLowerCase()
}

export function resolveExtension(extension: string | null): string | null {
  if (!extension) {
    return null
  }

  return EXTENSION_ALIASES[extension] ?? extension
}

export function getFileIconMeta(fileName: string): FileIconMeta {
  const extractedExtension = getFileExtension(fileName)
  const extension = resolveExtension(extractedExtension)

  if (!extension) {
    return {
      extension: null,
      iconKey: null,
      color: null,
    }
  }

  return {
    extension,
    iconKey: EXTENSION_ICON_KEY_MAP[extension] ?? null,
    color: EXTENSION_COLOR_MAP[extension] ?? null,
  }
}
