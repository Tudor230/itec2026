import { describe, expect, it } from 'vitest'
import {
  getFileExtension,
  getFileIconMeta,
  resolveExtension,
} from './file-icon-map'

describe('file icon map', () => {
  it('extracts extension from filenames and paths', () => {
    expect(getFileExtension('main.ts')).toBe('.ts')
    expect(getFileExtension('src/views/Screen.TSX')).toBe('.tsx')
    expect(getFileExtension('archive.tar.gz')).toBe('.gz')
  })

  it('returns null for invalid extension shapes', () => {
    expect(getFileExtension('README')).toBeNull()
    expect(getFileExtension('.env')).toBeNull()
    expect(getFileExtension('trailing.')).toBeNull()
    expect(getFileExtension('')).toBeNull()
  })

  it('resolves aliases', () => {
    expect(resolveExtension('.c++')).toBe('.cpp')
    expect(resolveExtension('.doc')).toBe('.docx')
    expect(resolveExtension('.xls')).toBe('.xlsx')
  })

  it('returns known icon metadata for supported types', () => {
    expect(getFileIconMeta('script.py')).toEqual({
      extension: '.py',
      iconKey: 'SiPython',
      color: '#3776AB',
    })

    expect(getFileIconMeta('Main.java')).toEqual({
      extension: '.java',
      iconKey: 'FaJava',
      color: '#EA2D2E',
    })

    expect(getFileIconMeta('report.xlsx')).toEqual({
      extension: '.xlsx',
      iconKey: 'SiGooglesheets',
      color: '#217346',
    })

    expect(getFileIconMeta('book.pdf')).toEqual({
      extension: '.pdf',
      iconKey: 'FaFilePdf',
      color: '#E02028',
    })
  })

  it('returns fallback metadata for unsupported files', () => {
    expect(getFileIconMeta('notes.abc')).toEqual({
      extension: '.abc',
      iconKey: null,
      color: null,
    })

    expect(getFileIconMeta('Dockerfile')).toEqual({
      extension: null,
      iconKey: null,
      color: null,
    })
  })
})
