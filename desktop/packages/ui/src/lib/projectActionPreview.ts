export function isSupportedPosixShell(shell: string): boolean {
  return /(?:^|\/)(?:sh|bash|zsh)$/.test(shell)
}

/** Pin an owned project action without changing the user's interactive shell directory. */
export function commandInProjectDirectory(command: string, directory: string): string {
  if (
    !directory ||
    Array.from(directory).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  ) {
    throw new Error("Invalid project action directory")
  }
  return `(cd '${directory.replaceAll("'", "'\\''")}' || exit 1\n${command}\n)`
}

/** A server prints this after binding; a command echo or an unrelated URL is not readiness. */
export function readyProjectActionUrl(output: string, expectedUrl: string): string | null {
  let expected: URL
  try {
    expected = new URL(expectedUrl)
  } catch {
    return null
  }
  if (!/^https?:$/.test(expected.protocol) || expected.username || expected.password) return null
  const escape = String.fromCharCode(27)
  const plain = output.replace(new RegExp(`${escape}\\[[0-9;?]*[ -/]*[@-~]`, "g"), "")
  for (const line of plain.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:Local URL|URL):\s+(https?:\/\/\S+)\s*$/)
    if (!match) continue
    try {
      const url = new URL(match[1])
      if (!url.username && !url.password && url.origin === expected.origin) return expected.href
    } catch {
      /* Incomplete output is not ready. */
    }
  }
  return null
}
