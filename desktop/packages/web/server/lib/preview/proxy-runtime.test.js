import { describe, expect, it, vi } from "vitest"

import {
  buildPreviewProxyUpstreamPath,
  mergeExternalPreviewSandboxCsp,
  classifyPreviewNavigation,
  classifyPreviewResourceError,
  createPreviewProxyRuntime,
  normalizeProxyTargetUrl,
  removeSensitivePreviewProxyHeaders,
  rewritePreviewBody,
} from "./proxy-runtime.js"

const rewrite = (bodyText, kind) =>
  rewritePreviewBody({
    bodyText,
    kind,
    proxyBasePath: "/api/preview/proxy/abc123",
    targetOrigin: "http://127.0.0.1:3000",
  })

describe("preview resource error classification", () => {
  it("suppresses Astro/Vite stylesheet modules reported as failed scripts", () => {
    expect(
      classifyPreviewResourceError({
        tagName: "script",
        url: "http://127.0.0.1:57123/api/preview/proxy/f4af70b4261d77706743959516f9cecc/src/styles/global.css",
      }),
    ).toBe("suppress")

    expect(
      classifyPreviewResourceError({
        tagName: "script",
        url: "http://127.0.0.1:57123/api/preview/proxy/f4af70b4261d77706743959516f9cecc/src/pages/support.astro?astro&type=style&index=0&lang.css",
      }),
    ).toBe("suppress")
  })

  it("suppresses framework virtual modules reported by dev servers", () => {
    expect(
      classifyPreviewResourceError({
        tagName: "script",
        url: "http://127.0.0.1:57123/api/preview/proxy/f4af70b4261d77706743959516f9cecc/src/layouts/BaseLayout.astro?astro&type=script&index=0&lang.ts",
      }),
    ).toBe("suppress")

    expect(
      classifyPreviewResourceError({
        tagName: "script",
        url: "http://127.0.0.1:57123/api/preview/proxy/f4af70b4261d77706743959516f9cecc/@vite/client",
      }),
    ).toBe("suppress")

    expect(
      classifyPreviewResourceError({
        tagName: "link",
        url: "http://127.0.0.1:57123/api/preview/proxy/f4af70b4261d77706743959516f9cecc/@id/astro:scripts/page.js",
      }),
    ).toBe("suppress")
  })

  it("suppresses conservative ecosystem dev-runtime resources", () => {
    const noisyResources = [
      "/_next/static/chunks/webpack.js",
      "/_next/static/chunks/react-refresh.js",
      "/.svelte-kit/generated/client/app.js",
      "/@id/__x00__virtual:sveltekit:browser",
      "/@remix-run/dev/dist/browser.js",
      "/__hmr?runtime=remix",
      "/_nuxt/@vite/client",
      "/_nuxt/@id/virtual:nuxt:%2FUsers%2Fapp",
      "/webpack-dev-server/client/index.js",
      "/webpack/hot/dev-server.js",
      "/__webpack_hmr",
    ]

    for (const resource of noisyResources) {
      expect(
        classifyPreviewResourceError({
          tagName: "script",
          url: `http://127.0.0.1:57123/api/preview/proxy/f4af70b4261d77706743959516f9cecc${resource}`,
        }),
      ).toBe("suppress")
    }
  })

  it("keeps ordinary application resource failures visible", () => {
    expect(
      classifyPreviewResourceError({
        tagName: "script",
        url: "http://127.0.0.1:57123/api/preview/proxy/f4af70b4261d77706743959516f9cecc/assets/app.js",
      }),
    ).toBe("report")

    expect(
      classifyPreviewResourceError({
        tagName: "img",
        url: "http://127.0.0.1:57123/api/preview/proxy/f4af70b4261d77706743959516f9cecc/missing.png",
      }),
    ).toBe("report")

    expect(
      classifyPreviewResourceError({
        tagName: "link",
        url: "http://127.0.0.1:57123/api/preview/proxy/f4af70b4261d77706743959516f9cecc/styles/missing.css",
      }),
    ).toBe("report")
  })
})

describe("preview body URL rewriting", () => {
  it("rewrites only HTML resource attributes in HTML responses", () => {
    const input = '<img src="/logo.png"><a href="/docs">Docs</a><script>const url = "/api/data";</script>'
    const output = rewrite(input, "html")

    expect(output).toContain('src="/api/preview/proxy/abc123/logo.png"')
    expect(output).toContain('href="/api/preview/proxy/abc123/docs"')
    expect(output).toContain('const url = "/api/data";')
  })

  it("rewrites root-relative url() references written inline in HTML", () => {
    // A <style> block or a style attribute resolves url(/…) against the Desktop
    // origin, where this proxy lives, so it has to be mapped like an attribute.
    const input =
      '<style>.hero{background:url(/img/hero.png)}</style><div style="background-image:url(\'/img/inline.png\')"></div><img src="/logo.png">'
    const output = rewrite(input, "html")

    expect(output).toContain("url(/api/preview/proxy/abc123/img/hero.png)")
    expect(output).toContain("url('/api/preview/proxy/abc123/img/inline.png')")
    expect(output).toContain('src="/api/preview/proxy/abc123/logo.png"')
  })

  it("leaves absolute and non-http url() values inline in HTML alone", () => {
    const input =
      '<style>.a{background:url(https://cdn.example.com/x.png)}.b{background:url("data:image/png;base64,AA")}.c{background:url(#gradient)}</style>'

    expect(rewrite(input, "html")).toBe(input)
  })

  it("rewrites a meta refresh target so the frame stays inside the proxy", () => {
    // A meta refresh navigates the iframe itself; left alone, it loads the Desktop origin's /next, not the
    // previewed app's.
    const output = rewrite('<meta http-equiv="refresh" content="0;url=/next">', "html")

    expect(output).toContain('content="0;url=/api/preview/proxy/abc123/next"')
  })

  it("rewrites protocol-relative references to an https target", () => {
    // The branch parsed every protocol-relative URL as http, so an https target never matched and the resource
    // loaded straight from the site.
    const output = rewritePreviewBody({
      bodyText: '<script src="//example.com/a.js"></script><img src="//EXAMPLE.com:443/b.png">',
      kind: "html",
      proxyBasePath: "/api/preview/proxy/abc123",
      targetOrigin: "https://example.com",
    })

    expect(output).toContain('src="/api/preview/proxy/abc123/a.js"')
    expect(output).toContain('src="/api/preview/proxy/abc123/b.png"')
  })

  it("leaves a meta refresh to another origin alone", () => {
    const input = '<meta http-equiv="refresh" content="0;url=https://example.com/next">'

    expect(rewrite(input, "html")).toBe(input)
  })

  it("rewrites protocol-relative references to the target", () => {
    // The root-relative branch explicitly skips `//`, and `new URL("//host/x")` needs a base, so these escaped
    // the proxy and loaded straight from the dev server — for `<base>`, everything relative escaped with them.
    const input =
      '<script src="//127.0.0.1:3000/app.js"></script><style>a{background:url(//127.0.0.1:3000/x.png)}</style>' +
      '<meta http-equiv="refresh" content="0;url=//127.0.0.1:3000/next"><base href="//127.0.0.1:3000/docs/">'
    const output = rewrite(input, "html")

    expect(output).not.toContain("//127.0.0.1:3000")
    expect(output).toContain('src="/api/preview/proxy/abc123/app.js"')
    expect(output).toContain("url(/api/preview/proxy/abc123/x.png)")
    expect(output).toContain('content="0;url=/api/preview/proxy/abc123/next"')
    expect(output).toContain('href="/api/preview/proxy/abc123/docs/"')

    // Another host is not the target and stays as written.
    expect(rewrite('<img src="//cdn.example.com/x.png">', "html")).toContain('src="//cdn.example.com/x.png"')
  })

  it("rewrites only CSS imports and url references in CSS responses", () => {
    const input = '@import "/theme.css"; .hero { background: url(/hero.png); } .copy::after { content: "/not-a-url"; }'
    const output = rewrite(input, "css")

    expect(output).toContain('@import "/api/preview/proxy/abc123/theme.css"')
    expect(output).toContain("url(/api/preview/proxy/abc123/hero.png)")
    expect(output).toContain('content: "/not-a-url"')
  })

  it("rewrites only JavaScript static import specifiers in JavaScript responses", () => {
    const input = 'import "/entry.js"; import value from "/module.js"; const url = "/api/data"; fetch("/api/data");'
    const output = rewrite(input, "javascript")

    expect(output).toContain('import "/api/preview/proxy/abc123/entry.js"')
    expect(output).toContain('from "/api/preview/proxy/abc123/module.js"')
    expect(output).toContain('const url = "/api/data"')
    expect(output).toContain('fetch("/api/data")')
  })
})

describe("preview navigation policy", () => {
  const currentUrl = "http://127.0.0.1:57123/api/preview/proxy/f4af70b4261d77706743959516f9cecc/docs"

  it("keeps same-page hash and already-proxied links in the iframe", () => {
    expect(classifyPreviewNavigation({ url: "#section", currentUrl }).action).toBe("allow")
    expect(
      classifyPreviewNavigation({
        url: "http://127.0.0.1:57123/api/preview/proxy/f4af70b4261d77706743959516f9cecc/roadmap",
        currentUrl,
      }).action,
    ).toBe("allow")
  })

  it("routes loopback absolute links through the preview proxy", () => {
    expect(classifyPreviewNavigation({ url: "http://localhost:3000/roadmap", currentUrl })).toEqual({
      action: "proxy",
      url: "http://localhost:3000/roadmap",
    })

    expect(classifyPreviewNavigation({ url: "http://127.0.0.2:3000/roadmap", currentUrl })).toEqual({
      action: "proxy",
      url: "http://127.0.0.2:3000/roadmap",
    })
  })

  it("maps app-origin root links back to the upstream origin while proxied", () => {
    expect(
      classifyPreviewNavigation({
        url: "http://127.0.0.1:57123/support",
        currentUrl,
        targetOrigin: "https://openchamber.dev",
      }),
    ).toEqual({
      action: "proxy",
      url: "https://openchamber.dev/support",
    })
  })

  it("sends non-loopback http links outside the preview iframe", () => {
    expect(classifyPreviewNavigation({ url: "https://example.com/docs", currentUrl })).toEqual({
      action: "external",
      url: "https://example.com/docs",
    })
  })

  it("leaves non-http links to browser defaults", () => {
    expect(classifyPreviewNavigation({ url: "mailto:test@example.com", currentUrl })).toEqual({
      action: "allow",
      url: "mailto:test@example.com",
    })
  })
})

describe("proxy target normalization (SSRF guard)", () => {
  it("allows ordinary external hosts when allowExternal is set", () => {
    expect(normalizeProxyTargetUrl("https://docs.openchamber.dev/security/", { allowExternal: true })).toEqual({
      ok: true,
      origin: "https://docs.openchamber.dev",
    })
  })

  it("refuses every first-hextet variant of the IPv6 link-local /10", () => {
    for (let prefix = 0xfe80; prefix <= 0xfebf; prefix += 1) {
      expect(normalizeProxyTargetUrl(`http://[${prefix.toString(16)}::1]/`, { allowExternal: true }).ok).toBe(false)
    }
    expect(normalizeProxyTargetUrl("https://[2606:4700:4700::1111]/", { allowExternal: true }).ok).toBe(true)
  })

  it("canonicalizes a fully qualified localhost name only on the local path", () => {
    expect(normalizeProxyTargetUrl("http://localhost.:5173/", {})).toEqual({
      ok: true,
      origin: "http://127.0.0.1:5173",
    })
    expect(normalizeProxyTargetUrl("http://localhost.:5173/", { allowExternal: true }).ok).toBe(false)
    expect(normalizeProxyTargetUrl("http://localhost.example:5173/", {}).ok).toBe(false)
  })

  it("rejects non-loopback hosts without allowExternal", () => {
    expect(normalizeProxyTargetUrl("https://example.com/", {}).ok).toBe(false)
  })

  it("allows the full IPv4 loopback range for local preview targets", () => {
    expect(normalizeProxyTargetUrl("http://127.0.0.2:5173/", {})).toEqual({
      ok: true,
      origin: "http://127.0.0.2:5173",
    })
  })

  it("refuses private, loopback and link-local literals on the external path", () => {
    for (const url of [
      "http://127.0.0.1/",
      "http://10.0.0.5/",
      "http://172.16.9.9/",
      "http://192.168.1.1/",
      "http://169.254.169.254/latest/meta-data/",
      "http://100.64.0.1/",
      "http://localhost/",
      "http://service.local/",
      "http://[::1]/",
      "http://[fd00::1]/",
      "http://[fe80::1]/",
      "http://2130706433/", // decimal form of 127.0.0.1, normalized by WHATWG URL
    ]) {
      expect(normalizeProxyTargetUrl(url, { allowExternal: true }).ok, url).toBe(false)
    }
  })

  it("still blocks private hosts even via IPv4-mapped IPv6", () => {
    expect(normalizeProxyTargetUrl("http://[::ffff:127.0.0.1]/", { allowExternal: true }).ok).toBe(false)
  })

  it("blocks a private host however its IPv6 address is written", () => {
    // Matching the text `::ffff:` missed the expanded form, which the OS still routes to the
    // IPv4 address it carries: `0:0:0:0:0:ffff:7f00:1` reached the loopback while the guard
    // called it external. The compatible form is refused too, though no OS routes it.
    for (const url of [
      "http://[::ffff:7f00:1]/",
      "http://[0:0:0:0:0:ffff:7f00:1]/",
      "http://[0:0:0:0:0:ffff:127.0.0.1]/",
      "http://[::ffff:169.254.169.254]/",
      "http://[0:0:0:0:0:ffff:a9fe:a9fe]/",
      "http://[::7f00:1]/",
    ]) {
      expect(normalizeProxyTargetUrl(url, { allowExternal: true }).ok, url).toBe(false)
    }
  })

  it("keeps an external host reachable through its mapped or global IPv6 form", () => {
    // The mapped form carries a public address here, so refusing it would only be a false alarm.
    expect(normalizeProxyTargetUrl("http://[0:0:0:0:0:ffff:808:808]/", { allowExternal: true }).ok).toBe(true)
    expect(normalizeProxyTargetUrl("http://[2001:4860:4860::8888]/", { allowExternal: true }).ok).toBe(true)
  })

  it("refuses a loopback name written with its root dot", () => {
    // The WHATWG parser keeps a fully-qualified name's trailing dot, and the resolver treats
    // `localhost.` exactly like `localhost`, so the name rules have to see the same name.
    for (const url of [
      "http://localhost./",
      "http://localhost.:3100/",
      "http://svc.localhost./",
      "http://printer.local./",
      "http://localhost../",
    ]) {
      expect(normalizeProxyTargetUrl(url, { allowExternal: true }).ok, url).toBe(false)
    }
  })
})

describe("external preview sandbox CSP", () => {
  const SANDBOX = "sandbox allow-scripts"

  it("keeps the upstream's directives and adds the proxy's sandbox", () => {
    expect(mergeExternalPreviewSandboxCsp("default-src 'none'; img-src 'self'", SANDBOX)).toBe(
      "default-src 'none'; img-src 'self', sandbox allow-scripts",
    )
  })

  it("drops only the upstream's own sandbox directive", () => {
    expect(mergeExternalPreviewSandboxCsp("sandbox allow-same-origin; img-src 'self'", SANDBOX)).toBe(
      "img-src 'self', sandbox allow-scripts",
    )
  })

  it("keeps every policy when the upstream sent them as repeated headers", () => {
    // Express hands an upstream that sent the header twice an array; reading only the string form
    // replaced the site's whole policy with ours.
    expect(mergeExternalPreviewSandboxCsp(["default-src 'none'", "img-src 'self'"], SANDBOX)).toBe(
      "default-src 'none', img-src 'self', sandbox allow-scripts",
    )
  })

  it("adds the proxy's sandbox when the upstream sent none", () => {
    expect(mergeExternalPreviewSandboxCsp(null, SANDBOX)).toBe(SANDBOX)
    expect(mergeExternalPreviewSandboxCsp("sandbox allow-same-origin", SANDBOX)).toBe(SANDBOX)
  })

  it("does not let a comma-separated policy list smuggle the upstream sandbox", () => {
    // A CSP header is a comma-separated list of policies. The attacker's `sandbox allow-same-origin` lived in
    // the second policy; appending ours to the same policy made it a duplicate, which browsers ignore.
    const merged = mergeExternalPreviewSandboxCsp(
      "default-src 'self', sandbox allow-same-origin allow-scripts",
      SANDBOX,
    )

    expect(merged).not.toContain("allow-same-origin")
    expect(merged.split(",").map((policy) => policy.trim())).toEqual(["default-src 'self'", SANDBOX])
  })
})

describe("preview proxy upstream request hygiene", () => {
  it("strips the preview proxy prefix and internal reload nonce", () => {
    expect(
      buildPreviewProxyUpstreamPath(
        "/api/preview/proxy/f4af70b4261d77706743959516f9cecc/@vite/client?ocPreview=42&x=1",
        "f4af70b4261d77706743959516f9cecc",
      ),
    ).toBe("/@vite/client?x=1")

    expect(
      buildPreviewProxyUpstreamPath(
        "/api/preview/proxy/f4af70b4261d77706743959516f9cecc/ws?x=1&ocPreview=42",
        "f4af70b4261d77706743959516f9cecc",
      ),
    ).toBe("/ws?x=1")
  })

  it("keeps malformed percent-encoded query parameters without breaking proxying", () => {
    expect(
      buildPreviewProxyUpstreamPath(
        "/api/preview/proxy/f4af70b4261d77706743959516f9cecc/ws?ocPreview=42&%E0%A4%A=1&x=2",
        "f4af70b4261d77706743959516f9cecc",
      ),
    ).toBe("/ws?%E0%A4%A=1&x=2")
  })

  it("removes Desktop credentials from proxied HTTP and WebSocket requests", () => {
    const removed = []
    removeSensitivePreviewProxyHeaders({
      removeHeader: (name) => {
        removed.push(name)
      },
    })

    expect(removed).toEqual(["cookie", "authorization", "x-openchamber-ui-session"])
  })

  it("registers the same credential scrubber for WebSocket proxy requests", () => {
    let capturedOptions = null
    const runtime = createPreviewProxyRuntime({
      crypto: {
        randomBytes: () => Buffer.from("0123456789abcdef"),
      },
      URL,
      createProxyMiddleware: (options) => {
        capturedOptions = options
        const middleware = vi.fn()
        middleware.upgrade = vi.fn()
        return middleware
      },
      responseInterceptor: (handler) => handler,
    })

    runtime.attach(
      { post: vi.fn(), use: vi.fn() },
      {
        server: { on: vi.fn() },
        express: { json: vi.fn(() => vi.fn()) },
        uiAuthController: null,
        isRequestOriginAllowed: vi.fn(async () => true),
        rejectWebSocketUpgrade: vi.fn(),
      },
    )

    const removed = []
    capturedOptions.on.proxyReqWs({
      removeHeader: (name) => {
        removed.push(name)
      },
    })

    expect(removed).toEqual(["cookie", "authorization", "x-openchamber-ui-session"])
  })

  it("rejects preview target creation from disallowed origins even when UI auth is disabled", async () => {
    let targetRoute = null
    const app = {
      post: (_path, ...handlers) => {
        targetRoute = handlers.at(-1)
      },
      use() {},
    }
    const runtime = createPreviewProxyRuntime({
      crypto: {
        randomBytes: () => Buffer.from("0123456789abcdef"),
      },
      URL,
      createProxyMiddleware: () => {
        const middleware = vi.fn()
        middleware.upgrade = vi.fn()
        return middleware
      },
      responseInterceptor: (handler) => handler,
    })
    runtime.attach(app, {
      server: { on: vi.fn() },
      express: { json: vi.fn(() => vi.fn()) },
      uiAuthController: null,
      isRequestOriginAllowed: async () => false,
      rejectWebSocketUpgrade: vi.fn(),
    })

    const res = {
      statusCode: 200,
      body: undefined,
      status(code) {
        this.statusCode = code
        return this
      },
      json(payload) {
        this.body = payload
        return this
      },
    }
    await targetRoute({ body: { url: "http://127.0.0.1:3000" }, headers: {}, secure: false }, res)

    expect(res.statusCode).toBe(403)
    expect(res.body).toEqual({ error: "Invalid origin" })
  })

  it("keeps the original target stable when a proxied resource redirects cross-origin", async () => {
    let targetRoute = null
    let proxyOptions = null
    let randomCounter = 0
    const app = {
      post: (_path, ...handlers) => {
        targetRoute = handlers.at(-1)
      },
      use() {},
    }
    const runtime = createPreviewProxyRuntime({
      crypto: {
        randomBytes: () => Buffer.from(String(++randomCounter).padStart(32, "0"), "hex"),
      },
      URL,
      createProxyMiddleware: (options) => {
        proxyOptions = options
        const middleware = vi.fn()
        middleware.upgrade = vi.fn()
        return middleware
      },
      responseInterceptor: (handler) => handler,
    })
    runtime.attach(app, {
      server: { on: vi.fn() },
      express: { json: vi.fn(() => vi.fn()) },
      uiAuthController: null,
      isRequestOriginAllowed: vi.fn(async () => true),
      rejectWebSocketUpgrade: vi.fn(),
    })

    const headers = new Map()
    const targetResponse = {
      setHeader: (name, value) => headers.set(name.toLowerCase(), value),
      json: vi.fn(),
    }
    await targetRoute({ body: { url: "http://127.0.0.1:3000" }, secure: false }, targetResponse)

    const [sourceCookie] = String(headers.get("set-cookie")).split(";", 1)
    const target = targetResponse.json.mock.calls[0][0]
    const request = {
      originalUrl: `${target.proxyBasePath}/style.css`,
      headers: { cookie: sourceCookie },
      secure: false,
    }
    const redirectHeaders = new Map()
    const redirectResponse = {
      statusCode: 302,
      removeHeader: vi.fn(),
      getHeader: (name) => redirectHeaders.get(name.toLowerCase()),
      setHeader: (name, value) => redirectHeaders.set(name.toLowerCase(), value),
    }

    await proxyOptions.on.proxyRes(
      Buffer.alloc(0),
      { statusCode: 302, headers: { location: "https://example.com/assets/style.css" } },
      request,
      redirectResponse,
    )

    expect(proxyOptions.router(request)).toBe("http://127.0.0.1:3000")
    const redirectedLocation = redirectHeaders.get("location")
    expect(redirectedLocation).toMatch(/^\/api\/preview\/proxy\/[a-f0-9]{32}\/assets\/style\.css$/)
    expect(redirectedLocation).not.toContain(target.id)

    const redirectedCookie = redirectHeaders.get("set-cookie")[0].split(";", 1)[0]
    const redirectedRequest = {
      originalUrl: redirectedLocation,
      headers: { cookie: `${sourceCookie}; ${redirectedCookie}` },
    }
    expect(proxyOptions.router(redirectedRequest)).toBe("https://example.com")
  })

  it("keeps its own upgrade handler authoritative for preview WebSocket upgrades", async () => {
    let targetRoute = null
    let proxyOptions = null
    let randomCounter = 0
    let upgradeHandler = null
    const upgradeMiddleware = vi.fn()
    const app = {
      post: (_path, ...handlers) => {
        targetRoute = handlers.at(-1)
      },
      use() {},
    }
    const runtime = createPreviewProxyRuntime({
      crypto: {
        randomBytes: () => Buffer.from(String(++randomCounter).padStart(32, "0"), "hex"),
      },
      URL,
      createProxyMiddleware: (options) => {
        proxyOptions = options
        const middleware = vi.fn()
        middleware.upgrade = upgradeMiddleware
        return middleware
      },
      responseInterceptor: (handler) => handler,
    })

    const rejectWebSocketUpgrade = vi.fn()
    const markWebSocketUpgradeClaimed = vi.fn()
    runtime.attach(app, {
      server: {
        on: (event, handler) => {
          if (event === "upgrade") upgradeHandler = handler
        },
      },
      express: { json: vi.fn(() => vi.fn()) },
      uiAuthController: null,
      isRequestOriginAllowed: vi.fn(async () => true),
      rejectWebSocketUpgrade,
      markWebSocketUpgradeClaimed,
    })

    // `ws: true` makes http-proxy-middleware subscribe its own upgrade listener as soon as an HTTP
    // request flows through it, and that listener proxies preview upgrades without the origin and
    // UI-auth checks below.
    expect(proxyOptions.ws).toBe(false)

    // Non-preview upgrades belong to the terminal, event-stream and renderer handlers.
    const foreignSocket = {}
    upgradeHandler({ url: "/api/terminal/ws", headers: {} }, foreignSocket, Buffer.alloc(0))
    expect(rejectWebSocketUpgrade).not.toHaveBeenCalled()
    expect(markWebSocketUpgradeClaimed).not.toHaveBeenCalled()
    expect(upgradeMiddleware).not.toHaveBeenCalled()

    // A preview path that resolves to no target is answered instead of left hanging.
    const previewSocket = {}
    upgradeHandler(
      { url: "/api/preview/proxy/f4af70b4261d77706743959516f9cecc/ws", headers: {} },
      previewSocket,
      Buffer.alloc(0),
    )
    expect(markWebSocketUpgradeClaimed).toHaveBeenCalledWith(previewSocket)
    expect(rejectWebSocketUpgrade).toHaveBeenCalledWith(expect.anything(), 404, "Preview target expired")
    expect(upgradeMiddleware).not.toHaveBeenCalled()

    // A valid preview upgrade still reaches the proxy, after the checks.
    const headers = new Map()
    const targetResponse = {
      setHeader: (name, value) => headers.set(name.toLowerCase(), value),
      json: vi.fn(),
    }
    await targetRoute({ body: { url: "http://127.0.0.1:3000" }, secure: false }, targetResponse)
    const [sourceCookie] = String(headers.get("set-cookie")).split(";", 1)
    const target = targetResponse.json.mock.calls[0][0]

    rejectWebSocketUpgrade.mockClear()
    upgradeHandler(
      { url: `${target.proxyBasePath}/ws`, headers: { cookie: sourceCookie } },
      { destroyed: false },
      Buffer.alloc(0),
    )

    await vi.waitFor(() => expect(upgradeMiddleware).toHaveBeenCalledTimes(1))
    expect(rejectWebSocketUpgrade).not.toHaveBeenCalled()
  })
})

describe("external preview documents are sandboxed", () => {
  const buildHarness = async ({ allowExternal }) => {
    let targetRoute = null
    let proxyOptions = null
    let randomCounter = 0
    const app = {
      post: (_path, ...handlers) => {
        targetRoute = handlers.at(-1)
      },
      use() {},
    }
    const runtime = createPreviewProxyRuntime({
      crypto: { randomBytes: () => Buffer.from(String(++randomCounter).padStart(32, "0"), "hex") },
      URL,
      createProxyMiddleware: (options) => {
        proxyOptions = options
        const middleware = vi.fn()
        middleware.upgrade = vi.fn()
        return middleware
      },
      responseInterceptor: (handler) => handler,
    })
    runtime.attach(app, {
      server: { on: vi.fn() },
      express: { json: vi.fn(() => vi.fn()) },
      uiAuthController: null,
      isRequestOriginAllowed: vi.fn(async () => true),
      rejectWebSocketUpgrade: vi.fn(),
    })

    const headers = new Map()
    const targetResponse = {
      setHeader: (name, value) => headers.set(name.toLowerCase(), value),
      json: vi.fn(),
    }
    await targetRoute(
      { body: { url: allowExternal ? "https://example.com" : "http://127.0.0.1:3000", allowExternal }, secure: false },
      targetResponse,
    )
    const target = targetResponse.json.mock.calls[0][0]
    const [sourceCookie] = String(headers.get("set-cookie")).split(";", 1)
    const request = {
      originalUrl: `${target.proxyBasePath}/`,
      headers: { cookie: sourceCookie },
      secure: false,
    }
    return { proxyOptions, request, target }
  }

  const runProxyRes = async ({ proxyOptions, request }, contentType) => {
    const responseHeaders = new Map()
    const res = {
      statusCode: 200,
      removeHeader: vi.fn(),
      getHeader: (name) => responseHeaders.get(name.toLowerCase()),
      setHeader: (name, value) => responseHeaders.set(name.toLowerCase(), value),
    }
    const body = await proxyOptions.on.proxyRes(
      Buffer.from("<html><head></head><body>hi</body></html>"),
      { statusCode: 200, headers: { "content-type": contentType } },
      request,
      res,
    )
    return { responseHeaders, body }
  }

  it("adds a sandbox policy without allow-same-origin to an external HTML document", async () => {
    const harness = await buildHarness({ allowExternal: true })

    const { responseHeaders } = await runProxyRes(harness, "text/html; charset=utf-8")

    const csp = String(responseHeaders.get("content-security-policy") ?? "")
    expect(csp).toContain("sandbox")
    expect(csp).not.toContain("allow-same-origin")
  })

  it("leaves a local dev preview unsandboxed", async () => {
    const harness = await buildHarness({ allowExternal: false })

    const { responseHeaders } = await runProxyRes(harness, "text/html; charset=utf-8")

    expect(String(responseHeaders.get("content-security-policy") ?? "")).not.toContain("sandbox")
  })

  it("sandboxes an external SVG document, which runs script too", async () => {
    // `text/html` was the only content type the sandbox covered, and an SVG from an external preview is a document
    // when it is opened directly: it ran script under the app's own policy — which allows inline script — on the
    // Desktop origin. The project-icon route carries its own policy for the same reason.
    const harness = await buildHarness({ allowExternal: true })

    const { responseHeaders } = await runProxyRes(harness, "image/svg+xml")

    const csp = String(responseHeaders.get("content-security-policy") ?? "")
    expect(csp).toContain("sandbox")
    expect(csp).not.toContain("allow-same-origin")
  })

  it("sandboxes an external XHTML document too", async () => {
    const harness = await buildHarness({ allowExternal: true })

    const { responseHeaders } = await runProxyRes(harness, "application/xhtml+xml; charset=utf-8")

    expect(String(responseHeaders.get("content-security-policy") ?? "")).toContain("sandbox")
  })

  it("tells the browser not to cache a rewritten preview document", async () => {
    // The upstream headers are already on `res` when the interceptor callback runs, so setting the policy on
    // `proxyRes.headers` afterwards never reached the browser — a rewritten preview body could be cached.
    const harness = await buildHarness({ allowExternal: true })

    const { responseHeaders } = await runProxyRes(harness, "text/html; charset=utf-8")

    expect(String(responseHeaders.get("cache-control") ?? "")).toContain("no-store")
    expect(String(responseHeaders.get("pragma") ?? "")).toBe("no-cache")
  })

  it("does not sandbox a non-document response", async () => {
    const harness = await buildHarness({ allowExternal: true })

    const { responseHeaders } = await runProxyRes(harness, "text/css")

    expect(String(responseHeaders.get("content-security-policy") ?? "")).not.toContain("sandbox")
  })

  it("replaces a sandbox directive the upstream supplied with its own", async () => {
    // The flags of that directive belong to whoever sends it, and an external
    // site is attacker-controlled: `allow-same-origin` in it would keep the
    // Desktop origin, and a second `sandbox` directive would be ignored.
    const harness = await buildHarness({ allowExternal: true })
    const responseHeaders = new Map()
    // http-proxy-middleware copies the upstream headers onto `res` before the
    // interceptor runs, so the upstream CSP is already there when it is applied.
    responseHeaders.set("content-security-policy", "default-src *; sandbox allow-scripts allow-same-origin allow-forms")
    const res = {
      statusCode: 200,
      removeHeader: vi.fn(),
      getHeader: (name) => responseHeaders.get(name.toLowerCase()),
      setHeader: (name, value) => responseHeaders.set(name.toLowerCase(), value),
    }

    await harness.proxyOptions.on.proxyRes(
      Buffer.from("<html><body>hi</body></html>"),
      {
        statusCode: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "content-security-policy": "default-src *; sandbox allow-scripts allow-same-origin allow-forms",
        },
      },
      harness.request,
      res,
    )

    const csp = String(responseHeaders.get("content-security-policy") ?? "")
    expect(csp.match(/sandbox/gi)).toHaveLength(1)
    expect(csp).not.toContain("allow-same-origin")
    expect(csp).toContain("default-src *")
  })

  it("sandboxes a document reached through a cross-origin redirect", async () => {
    // The redirect target is always a public host (loopback and private
    // addresses are refused), so its document needs the external sandbox even
    // when the preview it came from was a local one.
    let targetRoute = null
    let proxyOptions = null
    let randomCounter = 0
    const app = {
      post: (_path, ...handlers) => {
        targetRoute = handlers.at(-1)
      },
      use() {},
    }
    const runtime = createPreviewProxyRuntime({
      crypto: {
        randomBytes: () => Buffer.from(String(++randomCounter).padStart(32, "0"), "hex"),
      },
      URL,
      createProxyMiddleware: (options) => {
        proxyOptions = options
        const middleware = vi.fn()
        middleware.upgrade = vi.fn()
        return middleware
      },
      responseInterceptor: (handler) => handler,
    })
    runtime.attach(app, {
      server: { on: vi.fn() },
      express: { json: vi.fn(() => vi.fn()) },
      uiAuthController: null,
      isRequestOriginAllowed: vi.fn(async () => true),
      rejectWebSocketUpgrade: vi.fn(),
    })

    const headers = new Map()
    const targetResponse = {
      setHeader: (name, value) => headers.set(name.toLowerCase(), value),
      json: vi.fn(),
    }
    await targetRoute({ body: { url: "http://127.0.0.1:3000" }, secure: false }, targetResponse)

    const [sourceCookie] = String(headers.get("set-cookie")).split(";", 1)
    const target = targetResponse.json.mock.calls[0][0]
    const redirectHeaders = new Map()
    await proxyOptions.on.proxyRes(
      Buffer.alloc(0),
      { statusCode: 302, headers: { location: "https://example.com/login" } },
      { originalUrl: `${target.proxyBasePath}/`, headers: { cookie: sourceCookie }, secure: false },
      {
        statusCode: 302,
        removeHeader: vi.fn(),
        getHeader: (name) => redirectHeaders.get(name.toLowerCase()),
        setHeader: (name, value) => redirectHeaders.set(name.toLowerCase(), value),
      },
    )

    const redirectedLocation = redirectHeaders.get("location")
    const redirectedCookie = redirectHeaders.get("set-cookie")[0].split(";", 1)[0]
    const documentHeaders = new Map()
    await proxyOptions.on.proxyRes(
      Buffer.from("<html><body>login</body></html>"),
      { statusCode: 200, headers: { "content-type": "text/html; charset=utf-8" } },
      { originalUrl: redirectedLocation, headers: { cookie: `${sourceCookie}; ${redirectedCookie}` } },
      {
        statusCode: 200,
        removeHeader: vi.fn(),
        getHeader: (name) => documentHeaders.get(name.toLowerCase()),
        setHeader: (name, value) => documentHeaders.set(name.toLowerCase(), value),
      },
    )

    const csp = String(documentHeaders.get("content-security-policy") ?? "")
    expect(csp).toContain("sandbox")
    expect(csp).not.toContain("allow-same-origin")

    // XML documents execute script when the payload uses the XHTML/SVG namespace, so they are documents too.
    for (const contentType of ["application/xml", "text/xml"]) {
      const xmlHeaders = new Map()
      await proxyOptions.on.proxyRes(
        Buffer.from("<x/>"),
        { statusCode: 200, headers: { "content-type": contentType } },
        { originalUrl: redirectedLocation, headers: { cookie: `${sourceCookie}; ${redirectedCookie}` } },
        {
          statusCode: 200,
          removeHeader: (name) => xmlHeaders.delete(name.toLowerCase()),
          getHeader: (name) => xmlHeaders.get(name.toLowerCase()),
          setHeader: (name, value) => xmlHeaders.set(name.toLowerCase(), value),
        },
      )

      const xmlCsp = String(xmlHeaders.get("content-security-policy") ?? "")
      expect(xmlCsp).toContain("sandbox")
      expect(xmlCsp).not.toContain("allow-same-origin")
    }
  })

  it("keeps a local preview's redirect inside loopback within the proxy", async () => {
    // A dev server that canonicalizes to its own loopback name (localhost instead
    // of 127.0.0.1) or to another of its ports used to hand the raw Location to the
    // browser: the page left the proxy and lost the injected bridge and the
    // frame-header handling that makes it embeddable.
    let targetRoute = null
    let proxyOptions = null
    let randomCounter = 0
    const app = {
      post: (_path, ...handlers) => {
        targetRoute = handlers.at(-1)
      },
      use() {},
    }
    const runtime = createPreviewProxyRuntime({
      crypto: {
        randomBytes: () => Buffer.from(String(++randomCounter).padStart(32, "0"), "hex"),
      },
      URL,
      createProxyMiddleware: (options) => {
        proxyOptions = options
        const middleware = vi.fn()
        middleware.upgrade = vi.fn()
        return middleware
      },
      responseInterceptor: (handler) => handler,
    })
    runtime.attach(app, {
      server: { on: vi.fn() },
      express: { json: vi.fn(() => vi.fn()) },
      uiAuthController: null,
      isRequestOriginAllowed: vi.fn(async () => true),
      rejectWebSocketUpgrade: vi.fn(),
    })

    const headers = new Map()
    const targetResponse = {
      setHeader: (name, value) => headers.set(name.toLowerCase(), value),
      json: vi.fn(),
    }
    await targetRoute({ body: { url: "http://127.0.0.1:3000" }, secure: false }, targetResponse)

    const [sourceCookie] = String(headers.get("set-cookie")).split(";", 1)
    const target = targetResponse.json.mock.calls[0][0]
    const redirect = async (location, requestPath = "/") => {
      const redirectHeaders = new Map()
      await proxyOptions.on.proxyRes(
        Buffer.alloc(0),
        { statusCode: 302, headers: { location } },
        { originalUrl: `${target.proxyBasePath}${requestPath}`, headers: { cookie: sourceCookie }, secure: false },
        {
          statusCode: 302,
          removeHeader: vi.fn(),
          getHeader: (name) => redirectHeaders.get(name.toLowerCase()),
          setHeader: (name, value) => redirectHeaders.set(name.toLowerCase(), value),
        },
      )
      return redirectHeaders
    }

    // Another name for the same origin: the entry is reused, so no second target
    // and no second cookie.
    const qualifiedLocal = await redirect("http://localhost.:3000/dashboard")
    expect(qualifiedLocal.get("location")).toBe(`${target.proxyBasePath}/dashboard`)
    expect(qualifiedLocal.get("set-cookie")).toBeUndefined()
    const sameOrigin = await redirect("http://localhost:3000/dashboard")
    expect(sameOrigin.get("location")).toBe(`${target.proxyBasePath}/dashboard`)
    expect(sameOrigin.get("set-cookie")).toBeUndefined()
    expect(
      proxyOptions.router({ originalUrl: `${target.proxyBasePath}/dashboard`, headers: { cookie: sourceCookie } }),
    ).toBe("http://127.0.0.1:3000")

    // Another loopback port: a new target that is still proxied, and still local.
    const otherPort = await redirect("http://127.0.0.1:4000/app")
    const otherLocation = otherPort.get("location")
    expect(otherLocation).toMatch(/^\/api\/preview\/proxy\/[a-f0-9]{32}\/app$/)
    expect(otherLocation).not.toContain(target.id)
    const otherCookie = otherPort.get("set-cookie")[0].split(";", 1)[0]
    expect(
      proxyOptions.router({ originalUrl: otherLocation, headers: { cookie: `${sourceCookie}; ${otherCookie}` } }),
    ).toBe("http://127.0.0.1:4000")

    // A relative Location resolves against the URL of the request that produced it
    // (RFC 9110), not against the origin: `intro` from `/docs/guide` means `/docs/intro`,
    // and a query-only Location keeps the path it redirected from.
    const relative = await redirect("intro", "/docs/guide")
    expect(relative.get("location")).toBe(`${target.proxyBasePath}/docs/intro`)
    const queryOnly = await redirect("?page=2", "/docs/guide")
    expect(queryOnly.get("location")).toBe(`${target.proxyBasePath}/docs/guide?page=2`)

    // A path that begins with `//` is still the upstream's path, not another host: read as a relative
    // reference it became a protocol-relative URL and the redirect was rewritten for that host.
    const doubleSlash = await redirect("intro", "//evil.example/x")
    expect(doubleSlash.get("location")).toBe(`${target.proxyBasePath}//evil.example/intro`)
    expect(doubleSlash.get("set-cookie")).toBeUndefined()
  })
})

describe("preview proxy response hardening", () => {
  const createHarness = async ({ url = "http://127.0.0.1:3000", allowExternal = false } = {}) => {
    let targetRoute = null
    let proxyOptions = null
    let randomCounter = 0
    const app = {
      post: (_path, ...handlers) => {
        targetRoute = handlers.at(-1)
      },
      use() {},
    }
    const runtime = createPreviewProxyRuntime({
      crypto: {
        randomBytes: () => Buffer.from(String(++randomCounter).padStart(32, "0"), "hex"),
      },
      URL,
      createProxyMiddleware: (options) => {
        proxyOptions = options
        const middleware = vi.fn()
        middleware.upgrade = vi.fn()
        return middleware
      },
      responseInterceptor: (handler) => handler,
    })
    runtime.attach(app, {
      server: { on: vi.fn() },
      express: { json: vi.fn(() => vi.fn()) },
      uiAuthController: null,
      isRequestOriginAllowed: vi.fn(async () => true),
      rejectWebSocketUpgrade: vi.fn(),
    })

    const headers = new Map()
    const targetResponse = {
      setHeader: (name, value) => headers.set(name.toLowerCase(), value),
      json: vi.fn(),
    }
    await targetRoute({ body: { url, allowExternal }, secure: false }, targetResponse)
    const cookie = String(headers.get("set-cookie")).split(";", 1)[0]
    const target = targetResponse.json.mock.calls[0][0]
    return { proxyOptions, cookie, target }
  }

  const makeResponse = (headers, statusCode = 200) => ({
    statusCode,
    removeHeader: (name) => headers.delete(name.toLowerCase()),
    getHeader: (name) => headers.get(name.toLowerCase()),
    setHeader: (name, value) => headers.set(name.toLowerCase(), value),
  })

  it("strips Service-Worker-Allowed and Clear-Site-Data from proxied responses", async () => {
    // Both act on the shared Desktop origin. The first widens a worker's scope; the second wipes the app's
    // cookies, storage and cache from an untrusted page's response.
    const { proxyOptions, cookie, target } = await createHarness()
    const responseHeaders = new Map([
      ["service-worker-allowed", "/"],
      ["clear-site-data", '"cookies", "storage"'],
      ["refresh", "0;url=http://169.254.169.254/"],
    ])
    await proxyOptions.on.proxyRes(
      Buffer.from("<html></html>"),
      {
        statusCode: 200,
        headers: {
          "content-type": "text/html",
          "service-worker-allowed": "/",
          "clear-site-data": '"cookies", "storage"',
          refresh: "0;url=http://169.254.169.254/",
        },
      },
      { originalUrl: `${target.proxyBasePath}/`, headers: { cookie } },
      makeResponse(responseHeaders),
    )

    expect(responseHeaders.get("service-worker-allowed")).toBeUndefined()
    expect(responseHeaders.get("clear-site-data")).toBeUndefined()
    expect(responseHeaders.get("refresh")).toBeUndefined()
  })

  it("does not forward a Location the proxy refuses, nor the body that came with it", async () => {
    // http-proxy-middleware copies the upstream headers and body before the interceptor runs. Skipping the
    // rewrite left the raw LAN/metadata Location; the fix must also stop the redirect's HTML body from rendering
    // as a document on the Desktop origin.
    const { proxyOptions, cookie, target } = await createHarness()
    const responseHeaders = new Map([
      ["location", "http://169.254.169.254/latest/meta-data/"],
      ["content-type", "text/html"],
    ])
    const response = makeResponse(responseHeaders, 302)

    const body = await proxyOptions.on.proxyRes(
      Buffer.from("<script>alert(1)</script>"),
      {
        statusCode: 302,
        headers: { location: "http://169.254.169.254/latest/meta-data/", "content-type": "text/html" },
      },
      { originalUrl: `${target.proxyBasePath}/`, headers: { cookie } },
      response,
    )

    expect(responseHeaders.get("location")).toBeUndefined()
    expect(response.statusCode).toBe(502)
    expect(responseHeaders.get("content-type")).toContain("text/plain")
    expect(String(body)).not.toContain("alert")
  })

  it("drops a Location even when the target cannot be resolved", async () => {
    // An expired entry or a dropped token makes resolveTargetFromRequest fail after the router already proxied;
    // the guard skipped Location handling on that branch and forwarded the raw header.
    const { proxyOptions, target } = await createHarness()
    const responseHeaders = new Map([["location", "http://169.254.169.254/latest/meta-data/"]])
    const response = makeResponse(responseHeaders, 302)

    await proxyOptions.on.proxyRes(
      Buffer.alloc(0),
      { statusCode: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } },
      { originalUrl: `${target.proxyBasePath}/`, headers: { cookie: "wrong=1" } },
      response,
    )

    expect(responseHeaders.get("location")).toBeUndefined()
    expect(response.statusCode).toBe(502)
  })

  it("sandboxes every XML document type, including one with no content type", async () => {
    // Chrome renders any */*+xml as an XML document, and sniffs a missing content type as HTML; both can run
    // script in the XHTML/SVG namespace on the Desktop origin.
    const { proxyOptions, cookie, target } = await createHarness({ url: "https://example.com", allowExternal: true })
    for (const contentType of ["application/rss+xml", "application/xslt+xml", "application/xml; charset=utf-8", ""]) {
      const headers = new Map()
      await proxyOptions.on.proxyRes(
        Buffer.from("<x/>"),
        { statusCode: 200, headers: contentType ? { "content-type": contentType } : {} },
        { originalUrl: `${target.proxyBasePath}/`, headers: { cookie } },
        makeResponse(headers),
      )

      const csp = String(headers.get("content-security-policy") ?? "")
      expect(csp).toContain("sandbox")
      expect(csp).not.toContain("allow-same-origin")
    }
  })

  it("strips frame-ancestors from every comma-separated policy", async () => {
    // The helper split only on `;`, so a policy after a comma kept frame-ancestors 'none' and the preview could
    // not be framed at all.
    const { proxyOptions, cookie, target } = await createHarness()
    const upstream = "default-src 'self', frame-ancestors 'none'"
    const responseHeaders = new Map([["content-security-policy", upstream]])
    const response = makeResponse(responseHeaders)

    await proxyOptions.on.proxyRes(
      Buffer.from("<html></html>"),
      { statusCode: 200, headers: { "content-type": "text/html", "content-security-policy": upstream } },
      { originalUrl: `${target.proxyBasePath}/`, headers: { cookie } },
      response,
    )

    expect(String(responseHeaders.get("content-security-policy") ?? "")).not.toContain("frame-ancestors")
  })
})
