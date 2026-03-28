import { FaFilePdf, FaJava } from 'react-icons/fa6'
import type { IconType } from 'react-icons'
import {
  SiC,
  SiCplusplus,
  SiGitforwindows,
  SiGoogledocs,
  SiGooglesheets,
  SiJavascript,
  SiPython,
  SiReact,
  SiReadthedocs,
  SiTypescript,
} from 'react-icons/si'
import { FILE_ICON_KEYS, type FileIconKey } from './file-icon-map'

export const FILE_ICON_COMPONENTS: Record<FileIconKey, IconType> = {
  SiC,
  SiCplusplus,
  SiTypescript,
  SiReact,
  SiJavascript,
  SiPython,
  FaJava,
  SiGoogledocs,
  SiGooglesheets,
  FaFilePdf,
  SiReadthedocs,
  SiGitforwindows,
}

export function getFileIconComponent(iconKey: FileIconKey | null): IconType | null {
  if (!iconKey) {
    return null
  }

  if (!FILE_ICON_KEYS.includes(iconKey)) {
    return null
  }

  return FILE_ICON_COMPONENTS[iconKey] ?? null
}
