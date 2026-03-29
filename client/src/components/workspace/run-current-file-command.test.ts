import { describe, expect, it } from 'vitest'
import { buildRunCurrentFileCommand } from './run-current-file-command'

describe('buildRunCurrentFileCommand', () => {
  it('builds python command', () => {
    expect(buildRunCurrentFileCommand('src/main.py')).toEqual({
      ok: true,
      command: "(python3 -- 'src/main.py'; status=$?; printf '\\n'; exit $status)",
    })
  })

  it('builds node command for js-like files', () => {
    expect(buildRunCurrentFileCommand('src/app.js')).toEqual({
      ok: true,
      command: "(node -- 'src/app.js'; status=$?; printf '\\n'; exit $status)",
    })
    expect(buildRunCurrentFileCommand('src/app.mjs')).toEqual({
      ok: true,
      command: "(node -- 'src/app.mjs'; status=$?; printf '\\n'; exit $status)",
    })
    expect(buildRunCurrentFileCommand('src/app.cjs')).toEqual({
      ok: true,
      command: "(node -- 'src/app.cjs'; status=$?; printf '\\n'; exit $status)",
    })
  })

  it('builds compile and run command for c and cpp', () => {
    expect(buildRunCurrentFileCommand('src/hello.c')).toEqual({
      ok: true,
      command: "(tmp_dir=\"$(mktemp -d ./.itec-run-XXXXXX)\" && tmp_bin=\"$tmp_dir/itec-run-bin\" && gcc 'src/hello.c' -o \"$tmp_bin\" && \"$tmp_bin\"; status=$?; printf '\\n'; rm -rf \"$tmp_dir\"; exit $status)",
    })

    expect(buildRunCurrentFileCommand('src/hello.cpp')).toEqual({
      ok: true,
      command: "(tmp_dir=\"$(mktemp -d ./.itec-run-XXXXXX)\" && tmp_bin=\"$tmp_dir/itec-run-bin\" && g++ 'src/hello.cpp' -o \"$tmp_bin\" && \"$tmp_bin\"; status=$?; printf '\\n'; rm -rf \"$tmp_dir\"; exit $status)",
    })
  })

  it('escapes quotes in paths', () => {
    expect(buildRunCurrentFileCommand("src/o'reilly.py")).toEqual({
      ok: true,
      command: "(python3 -- 'src/o'\\''reilly.py'; status=$?; printf '\\n'; exit $status)",
    })
  })

  it('normalizes backslashes from windows paths', () => {
    expect(buildRunCurrentFileCommand('src\\demo.py')).toEqual({
      ok: true,
      command: "(python3 -- 'src/demo.py'; status=$?; printf '\\n'; exit $status)",
    })
  })

  it('rejects unsupported extensions', () => {
    expect(buildRunCurrentFileCommand('README.md')).toEqual({
      ok: false,
      reason: 'Cannot run .md files yet.',
    })
  })
})
