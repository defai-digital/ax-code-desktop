import { readLiteralPath } from "./path-values.mjs"

// These sources are shared. Each host owns executable checks, precedence and fallback discovery.
export const readAxCodeBinaryOverrides = (env) =>
  [
    env.AX_CODE_BINARY,
    env.AX_CODE_PATH,
    env.AX_CODE_DESKTOP_AX_CODE_PATH,
    env.AX_CODE_DESKTOP_AX_CODE_BIN,
  ].map(readLiteralPath).filter(Boolean)

export const readBundledAxCodeBinary = (env) => readLiteralPath(env.AX_CODE_DESKTOP_BUNDLED_AX_CODE_BINARY)
