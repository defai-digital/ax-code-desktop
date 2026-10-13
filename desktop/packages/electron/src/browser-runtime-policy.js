"use strict"

function desktopBrowserRuntimeEnv(env, token) {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    throw new Error("The Desktop browser requires a launcher-owned provider token")
  }
  return { ...env, AX_CODE_BROWSER_MODE: "embedded", AX_CODE_DESKTOP_BROWSER_TOKEN: token }
}

module.exports = { desktopBrowserRuntimeEnv }
