import type { OpenChamberProjectAction } from "./openchamberConfig"

const hasControlCharacters = (value: string) => {
  for (const character of value) {
    const code = character.charCodeAt(0)
    if (code <= 31 || code === 127) return true
  }
  return false
}
const quotePosixArgument = (value: string) => `'${value.replaceAll("'", "'\\''")}'`

export function isSupportedRecipeShell(shell: string): boolean {
  return /(?:^|\/)(?:sh|bash|zsh)$/.test(shell)
}

/** A user-selected command recipe, never an installer or a second process supervisor. */
export function createStreamlitProjectAction(input: {
  id: string
  name: string
  interpreter: string
  entrypoint: string
  port: string
}): OpenChamberProjectAction | null {
  const interpreter = input.interpreter.trim()
  const entrypoint = input.entrypoint.trim()
  const port = Number(input.port)
  if (
    !interpreter ||
    !entrypoint ||
    [input.interpreter, input.entrypoint].some(hasControlCharacters) ||
    !/^[0-9]+$/.test(input.port) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    entrypoint.startsWith("-") ||
    !entrypoint.endsWith(".py")
  )
    return null
  return {
    id: input.id,
    name: input.name,
    command: `${quotePosixArgument(interpreter)} -m streamlit run ${quotePosixArgument(entrypoint)} --server.address=127.0.0.1 --server.port=${port} --server.headless=true`,
    icon: "server",
    autoOpenUrl: true,
    openUrl: `http://127.0.0.1:${port}/`,
    waitForUrl: true,
    shell: "posix",
  }
}

/** Streamlit prints this after binding; a command echo or an unrelated URL is not readiness. */
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
