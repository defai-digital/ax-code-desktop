import { assertLocalOnlyHostname } from "../security/local-only.js"

const asNonEmptyString = (value) => {
  const normalized = typeof value === "string" ? value.trim() : ""
  return normalized.length > 0 ? normalized : undefined
}

export const parseServeCliOptions = ({ argv = [], env = {}, defaultPort }) => {
  const args = Array.isArray(argv) ? [...argv] : []
  const envPassword = env.AX_CODE_DESKTOP_UI_PASSWORD || env.AX_CODE_UI_PASSWORD || null
  const options = {
    port: defaultPort,
    host: undefined,
    uiPassword: envPassword,
  }

  const consumeValue = (currentIndex, inlineValue) => {
    if (typeof inlineValue === "string") {
      return { value: inlineValue, nextIndex: currentIndex }
    }
    const nextArg = args[currentIndex + 1]
    if (typeof nextArg === "string" && !nextArg.startsWith("--")) {
      return { value: nextArg, nextIndex: currentIndex + 1 }
    }
    return { value: undefined, nextIndex: currentIndex }
  }

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    const token = arg === "-p" ? "--port" : arg
    if (!token.startsWith("--")) {
      continue
    }

    const eqIndex = token.indexOf("=")
    const optionName = eqIndex >= 0 ? token.slice(2, eqIndex) : token.slice(2)
    const inlineValue = eqIndex >= 0 ? token.slice(eqIndex + 1) : undefined

    if (optionName === "port" || optionName === "p") {
      const { value, nextIndex } = consumeValue(i, inlineValue)
      i = nextIndex
      const parsedPort = parseInt(value ?? "", 10)
      options.port = Number.isFinite(parsedPort) ? parsedPort : defaultPort
      continue
    }

    if (optionName === "host") {
      const { value, nextIndex } = consumeValue(i, inlineValue)
      i = nextIndex
      options.host = assertLocalOnlyHostname(asNonEmptyString(value), "--host")
      continue
    }

    if (optionName === "ui-password") {
      const { value, nextIndex } = consumeValue(i, inlineValue)
      i = nextIndex
      options.uiPassword = typeof value === "string" ? value : ""
      continue
    }
  }

  return options
}
