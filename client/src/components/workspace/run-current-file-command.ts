export interface QueuedTerminalCommand {
  id: number
  command: string
}

export type RunCurrentFileCommandResult =
  | {
      ok: true
      command: string
    }
  | {
      ok: false
      reason: string
    }

function quoteShellArg(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function normalizeWorkspacePath(path: string) {
  return path.trim().replace(/\\+/g, '/')
}

function getExtension(path: string) {
  const leaf = path.split('/').pop() ?? ''
  const dotIndex = leaf.lastIndexOf('.')
  if (dotIndex <= 0 || dotIndex >= leaf.length - 1) {
    return ''
  }

  return leaf.slice(dotIndex + 1).toLowerCase()
}

export function buildRunCurrentFileCommand(path: string): RunCurrentFileCommandResult {
  const normalizedPath = normalizeWorkspacePath(path)
  if (!normalizedPath) {
    return {
      ok: false,
      reason: 'No file selected.',
    }
  }

  const extension = getExtension(normalizedPath)
  const quotedPath = quoteShellArg(normalizedPath)

  if (extension === 'py') {
    return {
      ok: true,
      command: `(python3 -- ${quotedPath}; status=$?; printf '\\n'; exit $status)`,
    }
  }

  if (extension === 'js' || extension === 'mjs' || extension === 'cjs') {
    return {
      ok: true,
      command: `(node -- ${quotedPath}; status=$?; printf '\\n'; exit $status)`,
    }
  }

  if (extension === 'c') {
    return {
      ok: true,
      command: `(tmp_dir="$(mktemp -d ./.itec-run-XXXXXX)" && tmp_bin="$tmp_dir/itec-run-bin" && gcc ${quotedPath} -o "$tmp_bin" && "$tmp_bin"; status=$?; printf '\\n'; rm -rf "$tmp_dir"; exit $status)`,
    }
  }

  if (extension === 'cpp' || extension === 'cc' || extension === 'cxx') {
    return {
      ok: true,
      command: `(tmp_dir="$(mktemp -d ./.itec-run-XXXXXX)" && tmp_bin="$tmp_dir/itec-run-bin" && g++ ${quotedPath} -o "$tmp_bin" && "$tmp_bin"; status=$?; printf '\\n'; rm -rf "$tmp_dir"; exit $status)`,
    }
  }

  return {
    ok: false,
    reason: `Cannot run .${extension || 'unknown'} files yet.`,
  }
}
