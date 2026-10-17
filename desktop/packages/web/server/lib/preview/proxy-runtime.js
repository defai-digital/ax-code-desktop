const DEFAULT_TARGET_TTL_MS = 30 * 60 * 1000
const TOKEN_COOKIE_NAME = "oc_preview_token"

const LOOPBACK_HOSTS = new Set(["localhost", "::1", "[::1]", "0.0.0.0"])

const isLoopbackHost = (hostname) => {
  if (!hostname) return false
  let host = String(hostname).toLowerCase()
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1)

  if (LOOPBACK_HOSTS.has(host)) return true

  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!v4) return false
  return Number(v4[1]) === 127
}

// Strip one directive from a CSP header value while preserving every other directive. Returns
// null if no directives remain.
const removeCspDirective = (cspValue, directiveName) => {
  if (typeof cspValue !== "string" || cspValue.length === 0) {
    return cspValue
  }
  const directives = cspValue
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)

  const filtered = directives.filter((directive) => {
    const name = directive.split(/\s+/, 1)[0]?.toLowerCase() ?? ""
    return name !== directiveName
  })

  if (filtered.length === 0) {
    return null
  }
  return filtered.join("; ")
}

/**
 * The CSP an external preview document is served with: the policy the upstream sent, minus its own
 * `sandbox` directive, followed by the proxy's. An upstream that sends the policy as repeated
 * headers arrives here as an array, and reading only the string form dropped its whole policy.
 */
export const mergeExternalPreviewSandboxCsp = (existingHeaderValue, sandboxCsp) => {
  const values =
    existingHeaderValue == null ? [] : Array.isArray(existingHeaderValue) ? existingHeaderValue : [existingHeaderValue]
  // A CSP header is a comma-separated list of policies, and each policy keeps enforcing its own directives. The
  // upstream's sandbox has to be removed from *every* policy, and ours appended as a policy of its own: joined
  // onto the end of the upstream's last policy it was a duplicate directive, which browsers ignore.
  const policies = values
    .flatMap((value) => String(value).split(","))
    .map((policy) => policy.trim())
    .filter((policy) => policy.length > 0)
    .map((policy) => removeCspDirective(policy, "sandbox"))
    .filter((policy) => typeof policy === "string" && policy.trim().length > 0)
  return [...policies, sandboxCsp].join(", ")
}

// Set on a response the proxy refuses itself, so a client can tell it apart from a 403/404 the
// previewed application sent (the preview probe treated both as "re-register the target" and
// re-registered forever over an upstream's own 404 page).
export const PREVIEW_REFUSAL_HEADER = "x-openchamber-preview-refusal"

// Exported so the bridge's own patches can be driven in a test: the script is injected into previewed pages, and its
// behaviour is otherwise only observable through a real browser.
export const PREVIEW_BRIDGE_SCRIPT_SOURCE = () => PREVIEW_BRIDGE_SCRIPT

const PREVIEW_BRIDGE_SCRIPT_ID = "openchamber-preview-bridge"

const parsePreviewResourcePath = (url) => {
  try {
    const parsed = new URL(String(url || ""), "http://localhost")
    const match = parsed.pathname.match(/^\/api\/preview\/proxy\/[a-f0-9]{16,64}(\/.*)?$/i)
    const path = match ? match[1] || "/" : parsed.pathname
    return path + parsed.search
  } catch {
    return String(url || "")
  }
}

const previewResourceNoiseRuleSets = [
  {
    name: "vite",
    suppress: ({ lower, path, tag }) =>
      path === "/@vite/client" ||
      path === "/@react-refresh" ||
      path.startsWith("/@id/__x00__vite/") ||
      lower.includes("/node_modules/.vite/") ||
      lower.includes("/vite/dist/client/") ||
      (tag === "script" && lower.includes("/@id/")),
  },
  {
    name: "astro",
    suppress: ({ lower, path, tag }) =>
      path.startsWith("/@id/astro:") ||
      lower.includes("/astro/dist/runtime/client/dev-toolbar/") ||
      (tag === "script" && lower.includes(".astro?") && lower.includes("type=script")) ||
      (tag === "script" &&
        (lower.endsWith(".css") ||
          lower.includes(".css?") ||
          lower.includes("type=style") ||
          lower.includes("lang.css"))),
  },
  {
    name: "next",
    suppress: ({ lower, path, tag }) =>
      tag === "script" &&
      (path === "/_next/webpack-hmr" ||
        lower.includes("/_next/static/webpack/") ||
        lower.includes("/_next/static/chunks/webpack") ||
        lower.includes("/_next/static/chunks/react-refresh") ||
        lower.includes("/_next/static/development/")),
  },
  {
    name: "sveltekit",
    suppress: ({ lower, tag }) =>
      tag === "script" &&
      (lower.includes("/@id/__x00__virtual:") ||
        lower.includes("/@id/virtual:") ||
        lower.includes("/.svelte-kit/generated/") ||
        lower.includes("/node_modules/.vite/deps/")),
  },
  {
    name: "remix",
    suppress: ({ lower, tag }) =>
      tag === "script" &&
      (lower.includes("/@remix-run/dev/") || lower.includes("/__manifest") || lower.includes("/__hmr")),
  },
  {
    name: "nuxt",
    suppress: ({ lower, tag }) =>
      tag === "script" &&
      (lower.includes("/_nuxt/@vite/client") ||
        lower.includes("/_nuxt/@id/") ||
        lower.includes("/_nuxt/node_modules/.vite/") ||
        lower.includes("/__nuxt_error") ||
        lower.includes("/__nuxt_vite_node__")),
  },
  {
    name: "webpack",
    suppress: ({ lower, path, tag }) =>
      tag === "script" &&
      (path === "/sockjs-node/info" ||
        lower.includes("/webpack-dev-server/") ||
        lower.includes("/webpack/hot/") ||
        lower.includes("/__webpack_hmr") ||
        (lower.includes("/ws") && lower.includes("webpack"))),
  },
]

export const classifyPreviewResourceError = ({ tagName, url }) => {
  const tag = typeof tagName === "string" ? tagName.toLowerCase() : ""
  if (tag !== "script" && tag !== "link") return "report"

  const pathAndSearch = parsePreviewResourcePath(url)
  const lower = pathAndSearch.toLowerCase()
  const path = pathAndSearch.split("?", 1)[0] || ""
  const context = { tag, path, pathAndSearch, lower }

  if (previewResourceNoiseRuleSets.some((ruleSet) => ruleSet.suppress(context))) return "suppress"

  return "report"
}

export const classifyPreviewNavigation = ({ url, currentUrl, targetOrigin }) => {
  let parsed
  try {
    parsed = new URL(String(url || ""), currentUrl || "http://localhost/")
  } catch {
    return { action: "allow", url: String(url || "") }
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { action: "allow", url: parsed.toString() }
  }

  let current
  try {
    current = new URL(currentUrl || "http://localhost/")
  } catch {
    current = null
  }

  if (
    current &&
    parsed.origin === current.origin &&
    parsed.pathname === current.pathname &&
    parsed.search === current.search &&
    parsed.hash
  ) {
    return { action: "allow", url: parsed.toString() }
  }

  const path = parsed.pathname || "/"
  const proxyMatch = current?.pathname?.match(/^(\/api\/preview\/proxy\/[a-f0-9]{16,64})(?:\/|$)/i)
  if (parsed.origin === current?.origin && path.startsWith("/api/preview/proxy/")) {
    return { action: "allow", url: parsed.toString() }
  }

  if (proxyMatch && parsed.origin === current?.origin && path.startsWith("/") && !path.startsWith(proxyMatch[1])) {
    try {
      if (targetOrigin) {
        const upstreamUrl = new URL(`${parsed.pathname}${parsed.search}${parsed.hash}`, targetOrigin)
        return { action: "proxy", url: upstreamUrl.toString() }
      }
    } catch {
      // fall through to the default policy
    }
  }

  if (isLoopbackHost(parsed.hostname) || (parsed.origin === current?.origin && path.startsWith("/"))) {
    return { action: "proxy", url: parsed.toString() }
  }

  return { action: "external", url: parsed.toString() }
}

const PREVIEW_BRIDGE_SCRIPT = String.raw`(() => {
  if (window.__openchamberPreviewBridgeInstalled) return;
  window.__openchamberPreviewBridgeInstalled = true;

  const SOURCE = 'openchamber-preview-bridge';
  const VERSION = 1;
  const MAX_TEXT = 500;
  const MAX_ARG = 1000;
  const TARGET_ORIGIN = typeof window.__openchamberPreviewTargetOrigin === 'string' ? window.__openchamberPreviewTargetOrigin : '';
  let inspectMode = false;
  let lastHoverKey = '';
  let pendingHover = null;
  let previewColorScheme = null;
  let nativeMatchMedia = null;
  const colorSchemeListeners = new Set();

  const post = (payload) => {
    try {
      if (window.parent && typeof window.parent.postMessage === 'function') {
        const message = Object.assign({ source: SOURCE, version: VERSION }, payload || {});
        window.parent.postMessage(message, window.location.origin);
      }
    } catch {}
  };

  const clip = (value, max = MAX_TEXT) => {
    const text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    return text.length > max ? text.slice(0, max) + '...' : text;
  };

  const stringifyArg = (value) => {
    if (typeof value === 'string') return clip(value, MAX_ARG);
    if (value instanceof Error) return clip(value.stack || value.message || String(value), MAX_ARG);
    try {
      return clip(JSON.stringify(value), MAX_ARG);
    } catch {
      return clip(String(value), MAX_ARG);
    }
  };

  const normalizeColorScheme = (value) => value === 'dark' ? 'dark' : value === 'light' ? 'light' : null;

  const mediaQueryColorScheme = (query) => {
    const normalized = String(query || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (normalized === '(prefers-color-scheme: dark)') return 'dark';
    if (normalized === '(prefers-color-scheme: light)') return 'light';
    return null;
  };

  const mediaQueryMatchesPreviewScheme = (query) => {
    const scheme = mediaQueryColorScheme(query);
    if (!scheme || !previewColorScheme) return null;
    return previewColorScheme === scheme;
  };

  const notifyColorSchemeListeners = () => {
    for (const listener of Array.from(colorSchemeListeners)) {
      try {
        const matches = mediaQueryMatchesPreviewScheme(listener.media);
        if (matches === null) continue;
        const event = { matches, media: listener.media, type: 'change', target: listener.mql, currentTarget: listener.mql };
        listener.callback.call(listener.mql, event);
        if (listener.once) listener.removeEntry();
      } catch {}
    }
  };

  const installColorSchemeMatchMediaPatch = () => {
    if (window.__openchamberPreviewColorSchemePatched || typeof window.matchMedia !== 'function') return;
    window.__openchamberPreviewColorSchemePatched = true;
    nativeMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = function(query) {
      const nativeMql = nativeMatchMedia(query);
      if (!mediaQueryColorScheme(query)) return nativeMql;
      const listenersForMql = new Map();
      const mql = Object.create(nativeMql);
      Object.defineProperty(mql, 'matches', { get: () => mediaQueryMatchesPreviewScheme(query) ?? nativeMql.matches });
      Object.defineProperty(mql, 'media', { get: () => nativeMql.media });
      // The wrapper inherits the platform's onchange accessor, which brand-checks its receiver and throws for an
      // Object.create receiver. Pages that use the old property would break on assignment, so the wrapper keeps the
      // handler itself and registers an internal listener for it.
      let onChangeHandler = null;
      const invokeOnChange = function(event) {
        if (typeof onChangeHandler === 'function') onChangeHandler.call(mql, event);
      };
      Object.defineProperty(mql, 'onchange', {
        get: () => onChangeHandler,
        set: (handler) => {
          const next = typeof handler === 'function' ? handler : null;
          onChangeHandler = next;
          if (next && !listenersForMql.has(invokeOnChange)) {
            mql.addEventListener('change', invokeOnChange);
          } else if (!next && listenersForMql.has(invokeOnChange)) {
            mql.removeEventListener('change', invokeOnChange);
          }
        },
      });
      mql.addEventListener = function(type, callback, options) {
        if (type !== 'change' || typeof callback !== 'function') return nativeMql.addEventListener?.(type, callback, options);
        // Adding a callback that is already registered is a no-op in the platform, and it has to
        // be here too: the set holds entries, so a second add left the first one behind and the
        // single removeEventListener the page then calls could never reach it. The orphan kept
        // firing — and kept its closure, and the page's DOM, alive — for good.
        if (listenersForMql.has(callback)) return;
        const opts = options && typeof options === 'object' ? options : {};
        // An aborted signal means the listener is already gone.
        if (opts.signal && opts.signal.aborted) return;
        // Strong on purpose: the platform keeps a MediaQueryList alive while it has listeners, so a
        // matchMedia(...).addEventListener(...) call without keeping a reference must keep working. Holding it
        // weakly made a collection silently stop the listener, which no page can observe or fix.
        const removeEntry = function() {
          const current = listenersForMql.get(callback);
          if (current) colorSchemeListeners.delete(current);
          listenersForMql.delete(callback);
        };
        const entry = { media: query, mql, callback, once: opts.once === true, removeEntry };
        listenersForMql.set(callback, entry);
        colorSchemeListeners.add(entry);
        // The signal cleanup a React effect relies on has to remove the listener, exactly as the platform does.
        if (opts.signal && typeof opts.signal.addEventListener === 'function') {
          opts.signal.addEventListener('abort', removeEntry, { once: true });
        }
      };
      mql.removeEventListener = function(type, callback, options) {
        if (type !== 'change' || typeof callback !== 'function') return nativeMql.removeEventListener?.(type, callback, options);
        const entry = listenersForMql.get(callback);
        if (entry) colorSchemeListeners.delete(entry);
        listenersForMql.delete(callback);
      };
      mql.addListener = function(callback) { mql.addEventListener('change', callback); };
      mql.removeListener = function(callback) { mql.removeEventListener('change', callback); };
      return mql;
    };
  };

  const shouldSyncDataTheme = () => {
    try {
      const root = document.documentElement;
      if (!root) return false;
      if (root.hasAttribute('data-theme')) return true;
      if (document.querySelector('starlight-theme-select, starlight-menu-button')) return true;
      const generator = document.querySelector('meta[name="generator"]');
      const generatorContent = generator && typeof generator.getAttribute === 'function' ? generator.getAttribute('content') || '' : '';
      if (generatorContent.toLowerCase().indexOf('starlight') >= 0) return true;
      const styles = window.getComputedStyle(root);
      return Boolean(styles.getPropertyValue('--sl-color-bg').trim()
        || styles.getPropertyValue('--sl-color-text').trim()
        || styles.getPropertyValue('--sl-color-accent').trim());
    } catch {
      return false;
    }
  };

  const applyPreviewColorScheme = (scheme) => {
    const next = normalizeColorScheme(scheme);
    if (!next || previewColorScheme === next) return;
    previewColorScheme = next;
    try {
      const root = document.documentElement;
      root.style.colorScheme = next;
      root.dataset.openchamberPreviewColorScheme = next;
      if (shouldSyncDataTheme()) {
        root.dataset.theme = next;
      }
    } catch {}
    notifyColorSchemeListeners();
  };

  const readElementUrl = (element) => {
    return element.currentSrc || element.src || element.href || element.action || '';
  };

  const upstreamPathForUrl = (value) => {
    try {
      const parsed = new URL(value, window.location.href);
      const match = parsed.pathname.match(/^\/api\/preview\/proxy\/[a-f0-9]{16,64}(\/.*)?$/i);
      return match ? (match[1] || '/') : parsed.pathname;
    } catch {
      return String(value || '');
    }
  };

  const upstreamPathAndSearchForUrl = (value) => {
    try {
      const parsed = new URL(value, window.location.href);
      const match = parsed.pathname.match(/^\/api\/preview\/proxy\/[a-f0-9]{16,64}(\/.*)?$/i);
      const path = match ? (match[1] || '/') : parsed.pathname;
      return path + parsed.search;
    } catch {
      return String(value || '');
    }
  };

  const isInternalDevToolResource = (element, value) => {
    const tag = element && element.tagName && typeof element.tagName.toLowerCase === 'function' ? element.tagName.toLowerCase() : '';
    if (tag !== 'script' && tag !== 'link') return false;
    if (tag === 'script' && typeof element.hasAttribute === 'function' && element.hasAttribute('data-cf-beacon')) return true;
    const pathAndSearch = upstreamPathAndSearchForUrl(value);
    const lower = pathAndSearch.toLowerCase();
    const path = pathAndSearch.split('?', 1)[0] || '';

    const viteNoise = path === '/@vite/client'
      || path === '/@react-refresh'
      || path.indexOf('/@id/__x00__vite/') === 0
      || lower.indexOf('/node_modules/.vite/') >= 0
      || lower.indexOf('/vite/dist/client/') >= 0
      || (tag === 'script' && lower.indexOf('/@id/') >= 0);
    const astroNoise = path.indexOf('/@id/astro:') === 0
      || lower.indexOf('/astro/dist/runtime/client/dev-toolbar/') >= 0
      || (tag === 'script' && lower.indexOf('.astro?') >= 0 && lower.indexOf('type=script') >= 0)
      || (tag === 'script' && (
        lower.endsWith('.css')
        || lower.indexOf('.css?') >= 0
        || lower.indexOf('type=style') >= 0
        || lower.indexOf('lang.css') >= 0
      ));
    const nextNoise = tag === 'script' && (
      path === '/_next/webpack-hmr'
      || lower.indexOf('/_next/static/webpack/') >= 0
      || lower.indexOf('/_next/static/chunks/webpack') >= 0
      || lower.indexOf('/_next/static/chunks/react-refresh') >= 0
      || lower.indexOf('/_next/static/development/') >= 0
    );
    const svelteKitNoise = tag === 'script' && (
      lower.indexOf('/@id/__x00__virtual:') >= 0
      || lower.indexOf('/@id/virtual:') >= 0
      || lower.indexOf('/.svelte-kit/generated/') >= 0
      || lower.indexOf('/node_modules/.vite/deps/') >= 0
    );
    const remixNoise = tag === 'script' && (
      lower.indexOf('/@remix-run/dev/') >= 0
      || lower.indexOf('/__manifest') >= 0
      || lower.indexOf('/__hmr') >= 0
    );
    const nuxtNoise = tag === 'script' && (
      lower.indexOf('/_nuxt/@vite/client') >= 0
      || lower.indexOf('/_nuxt/@id/') >= 0
      || lower.indexOf('/_nuxt/node_modules/.vite/') >= 0
      || lower.indexOf('/__nuxt_error') >= 0
      || lower.indexOf('/__nuxt_vite_node__') >= 0
    );
    const webpackNoise = tag === 'script' && (
      path === '/sockjs-node/info'
      || lower.indexOf('/webpack-dev-server/') >= 0
      || lower.indexOf('/webpack/hot/') >= 0
      || lower.indexOf('/__webpack_hmr') >= 0
      || (lower.indexOf('/ws') >= 0 && lower.indexOf('webpack') >= 0)
    );

    if (viteNoise || astroNoise || nextNoise || svelteKitNoise || remixNoise || nuxtNoise || webpackNoise) return true;
    return false;
  };

  installColorSchemeMatchMediaPatch();

  const isLoopbackHost = (hostname) => {
    if (!hostname) return false;
    let host = String(hostname).toLowerCase();
    if (host.charAt(0) === '[' && host.charAt(host.length - 1) === ']') host = host.slice(1, -1);
    if (host === 'localhost' || host === '0.0.0.0' || host === '::1') return true;
    const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    return Boolean(match && Number(match[1]) === 127);
  };

  const classifyNavigation = (value) => {
    try {
      const parsed = new URL(value, window.location.href);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return { action: 'allow', url: parsed.toString() };
      const current = new URL(window.location.href);
      const proxyMatch = current.pathname.match(/^(\/api\/preview\/proxy\/[a-f0-9]{16,64})(?:\/|$)/i);
      if (parsed.origin === current.origin && parsed.pathname === current.pathname && parsed.search === current.search && parsed.hash) {
        return { action: 'allow', url: parsed.toString() };
      }
      if (parsed.origin === current.origin && parsed.pathname.startsWith('/api/preview/proxy/')) {
        return { action: 'allow', url: parsed.toString() };
      }
      if (proxyMatch && parsed.origin === current.origin && parsed.pathname.startsWith('/') && parsed.pathname.indexOf(proxyMatch[1]) !== 0 && TARGET_ORIGIN) {
        try {
          const upstreamUrl = new URL(parsed.pathname + parsed.search + parsed.hash, TARGET_ORIGIN);
          return { action: 'proxy', url: upstreamUrl.toString() };
        } catch {}
      }
      if (isLoopbackHost(parsed.hostname) || (parsed.origin === current.origin && parsed.pathname.startsWith('/'))) {
        return { action: 'proxy', url: parsed.toString() };
      }
      return { action: 'external', url: parsed.toString() };
    } catch {
      return { action: 'allow', url: String(value || '') };
    }
  };

  const isInternalDevToolRuntimeError = (filename) => {
    const path = upstreamPathForUrl(filename || '');
    const pathAndSearch = upstreamPathAndSearchForUrl(filename || '');
    const lowerPathAndSearch = pathAndSearch.toLowerCase();
    const isStyleRuntimeNoise = lowerPathAndSearch.endsWith('.css')
      || lowerPathAndSearch.indexOf('.css?') >= 0
      || lowerPathAndSearch.indexOf('type=style') >= 0
      || lowerPathAndSearch.indexOf('lang.css') >= 0;
    return path === '/@vite/client'
      || path === '/@react-refresh'
      || path.indexOf('/astro/dist/runtime/client/dev-toolbar/') >= 0
      || path.indexOf('/node_modules/.vite/') >= 0
      || isStyleRuntimeNoise;
  };

  const isInternalDevToolConsoleNoise = (level, args) => {
    if (level !== 'error' || typeof args[0] !== 'string' || args[0].indexOf('[vite]') !== 0) return false;
    const text = args.map((arg) => stringifyArg(arg)).join(' ');
    return text.indexOf('failed to connect to websocket') >= 0
      || text.indexOf("Cannot read properties of undefined (reading 'send')") >= 0
      || text.indexOf('Cannot read properties of undefined (reading "send")') >= 0;
  };

  const installViteHmrProxyPatch = () => {
    if (window.__openchamberViteHmrProxyPatched || typeof window.WebSocket !== 'function') return;
    window.__openchamberViteHmrProxyPatched = true;
    const NativeWebSocket = window.WebSocket;
    const proxyMatch = window.location.pathname.match(/^(\/api\/preview\/proxy\/[a-f0-9]{16,64})(?:\/|$)/i);
    if (!proxyMatch) return;
    const proxyBase = proxyMatch[1] + '/';
    let reloadTimer = 0;

    const schedulePreviewReload = () => {
      if (reloadTimer) return;
      reloadTimer = window.setTimeout(() => {
        reloadTimer = 0;
        try {
          window.location.reload();
        } catch {}
      }, 80);
    };

    const rewriteUrl = (url, protocols) => {
      const protocolList = Array.isArray(protocols) ? protocols : [protocols];
      const isViteSocket = protocolList.indexOf('vite-hmr') >= 0 || protocolList.indexOf('vite-ping') >= 0;
      if (!isViteSocket) return url;
      try {
        const parsed = new URL(String(url), window.location.href);
        if (parsed.host !== window.location.host) return url;
        if (parsed.pathname.indexOf(proxyBase) === 0) return url;
        parsed.pathname = proxyBase;
        return parsed.toString();
      } catch {
        return url;
      }
    };

    function OpenChamberPreviewWebSocket(url, protocols) {
      const protocolList = Array.isArray(protocols) ? protocols : [protocols];
      const isViteSocket = protocolList.indexOf('vite-hmr') >= 0;
      const nextUrl = rewriteUrl(url, protocols);
      const socket = arguments.length === 1
        ? new NativeWebSocket(nextUrl)
        : new NativeWebSocket(nextUrl, protocols);

      if (isViteSocket) {
        socket.addEventListener('message', (event) => {
          try {
            const payload = JSON.parse(String(event.data || ''));
            if (payload && (payload.type === 'update' || payload.type === 'full-reload')) {
              schedulePreviewReload();
            }
          } catch {}
        });
      }

      return socket;
    }

    OpenChamberPreviewWebSocket.prototype = NativeWebSocket.prototype;
    Object.setPrototypeOf(OpenChamberPreviewWebSocket, NativeWebSocket);
    Object.defineProperty(OpenChamberPreviewWebSocket, 'name', { value: 'WebSocket' });
    window.WebSocket = OpenChamberPreviewWebSocket;
  };

  const installAppRequestProxyPatch = () => {
    if (window.__openchamberAppRequestProxyPatched) return;
    window.__openchamberAppRequestProxyPatched = true;
    const proxyMatch = window.location.pathname.match(/^(\/api\/preview\/proxy\/[a-f0-9]{16,64})(?:\/|$)/i);
    if (!proxyMatch) return;
    const proxyBase = proxyMatch[1];

    const shouldProxyPath = (pathname) => {
      if (typeof pathname !== 'string' || !pathname.startsWith('/') || pathname.startsWith('//')) return false;
      if (pathname.indexOf(proxyBase) === 0) return false;
      return true;
    };

    const proxiedUrl = (value) => {
      if (typeof value !== 'string') return value;
      if (value.startsWith('/')) {
        if (!shouldProxyPath(value)) return value;
        return proxyBase + value;
      }

      try {
        const parsed = new URL(value, window.location.href);
        if (parsed.origin === window.location.origin && shouldProxyPath(parsed.pathname)) {
          return proxyBase + parsed.pathname + parsed.search + parsed.hash;
        }
      } catch {}

      return value;
    };

    const proxiedWebSocketUrl = (value) => {
      if (typeof URL === 'function' && value instanceof URL) value = value.href;
      if (typeof value !== 'string') return value;
      try {
        const parsed = new URL(value, window.location.href);
        const current = new URL(window.location.href);
        const sameHost = parsed.host === current.host;
        const isWebSocketProtocol = parsed.protocol === 'ws:' || parsed.protocol === 'wss:';
        // WebSocket accepts a relative URL and an http(s) URL, upgrading the scheme. Both were left unproxied,
        // so the socket connected to the Desktop server's own /ws.
        const isHttpProtocol = parsed.protocol === 'http:' || parsed.protocol === 'https:';
        if (sameHost && (isWebSocketProtocol || isHttpProtocol) && shouldProxyPath(parsed.pathname)) {
          if (isHttpProtocol) parsed.protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
          parsed.pathname = proxyBase + parsed.pathname;
          return parsed.toString();
        }
      } catch {}
      return value;
    };

    if (typeof window.fetch === 'function') {
      const nativeFetch = window.fetch.bind(window);
      window.fetch = function(input, init) {
        if (typeof input === 'string') {
          return nativeFetch(proxiedUrl(input), init);
        }
        // fetch takes a URL object as well as a string, and this branch did not: fetch(new URL("/api/fs/x",
        // location.href)) went to the native fetch unproxied, straight at the Desktop server's own routes.
        if (input instanceof URL) {
          return nativeFetch(proxiedUrl(input.href), init);
        }
        if (input instanceof Request) {
          try {
            const parsed = new URL(input.url);
            if (parsed.origin === window.location.origin && shouldProxyPath(parsed.pathname)) {
              // Request needs an absolute URL; the proxy base is a path, so joining it with the old relative
              // string threw and every Request input fell through to the native fetch unproxied.
              const nextUrl = new URL(proxyBase + parsed.pathname + parsed.search + parsed.hash, window.location.href).toString();
              // The caller's init overrides the Request's own fields, as it does in fetch.
              const source = init === undefined ? input : new Request(input, init);
              const nextInit = {
                method: source.method,
                headers: source.headers,
                mode: source.mode,
                credentials: source.credentials,
                cache: source.cache,
                redirect: source.redirect,
                referrer: source.referrer,
                referrerPolicy: source.referrerPolicy,
                integrity: source.integrity,
                keepalive: source.keepalive,
                signal: source.signal,
              };
              if (source.body !== null) {
                // A stream body needs duplex in Chromium; without it the constructor throws and the fallback
                // below sends the request to the Desktop server instead of the preview origin.
                nextInit.body = source.body;
                nextInit.duplex = 'half';
              }
              return nativeFetch(new Request(nextUrl, nextInit));
            }
          } catch {}
        }
        return nativeFetch(input, init);
      };
    }

    if (window.XMLHttpRequest && window.XMLHttpRequest.prototype) {
      const nativeOpen = window.XMLHttpRequest.prototype.open;
      window.XMLHttpRequest.prototype.open = function(method, url) {
        const args = Array.prototype.slice.call(arguments);
        if (typeof url === 'string') {
          args[1] = proxiedUrl(url);
        } else if (typeof URL === 'function' && url instanceof URL) {
          // XHR.open takes a URL object too; leaving it unproxied sent the request to the Desktop server.
          args[1] = proxiedUrl(url.href);
        }
        return nativeOpen.apply(this, args);
      };
    }

    if (typeof window.EventSource === 'function') {
      const NativeEventSource = window.EventSource;
      function OpenChamberPreviewEventSource(url, eventSourceInitDict) {
        return new NativeEventSource(proxiedUrl(String(url)), eventSourceInitDict);
      }
      OpenChamberPreviewEventSource.prototype = NativeEventSource.prototype;
      Object.setPrototypeOf(OpenChamberPreviewEventSource, NativeEventSource);
      Object.defineProperty(OpenChamberPreviewEventSource, 'name', { value: 'EventSource' });
      window.EventSource = OpenChamberPreviewEventSource;
    }

    if (typeof window.WebSocket === 'function') {
      const NativeWebSocket = window.WebSocket;
      function OpenChamberPreviewAppWebSocket(url, protocols) {
        const nextUrl = proxiedWebSocketUrl(String(url));
        return arguments.length === 1
          ? new NativeWebSocket(nextUrl)
          : new NativeWebSocket(nextUrl, protocols);
      }
      OpenChamberPreviewAppWebSocket.prototype = NativeWebSocket.prototype;
      Object.setPrototypeOf(OpenChamberPreviewAppWebSocket, NativeWebSocket);
      Object.defineProperty(OpenChamberPreviewAppWebSocket, 'name', { value: 'WebSocket' });
      window.WebSocket = OpenChamberPreviewAppWebSocket;
    }
  };

  const selectorPart = (element) => {
    const tag = element.tagName.toLowerCase();
    if (element.id && /^[A-Za-z][\w:.-]*$/.test(element.id)) return tag + '#' + CSS.escape(element.id);
    const testId = element.getAttribute('data-testid') || element.getAttribute('data-test') || element.getAttribute('data-cy');
    if (testId) return tag + '[data-testid="' + CSS.escape(testId) + '"]';
    const classes = Array.from(element.classList || []).slice(0, 3).map((entry) => '.' + CSS.escape(entry)).join('');
    return tag + classes;
  };

  const buildSelector = (element) => {
    const parts = [];
    let current = element;
    while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.documentElement) {
      let part = selectorPart(current);
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter((child) => child.tagName === current.tagName);
        if (siblings.length > 1 && !part.includes('#') && !part.includes('[data-testid=')) {
          part += ':nth-of-type(' + (siblings.indexOf(current) + 1) + ')';
        }
      }
      parts.unshift(part);
      if (part.includes('#')) break;
      current = parent;
    }
    return parts.join(' > ');
  };

  const metadataForElement = (element) => {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return null;
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    const attributes = {};
    for (const name of ['id', 'class', 'role', 'aria-label', 'href', 'src', 'data-testid', 'data-test', 'data-cy']) {
      const value = typeof element.getAttribute === 'function' ? element.getAttribute(name) : null;
      if (value) attributes[name] = clip(value, 300);
    }
    const ancestry = [];
    let current = element;
    while (current && current.nodeType === Node.ELEMENT_NODE && ancestry.length < 6) {
      ancestry.unshift({
        tag: current.tagName.toLowerCase(),
        id: current.id || undefined,
        className: clip(current.className || '', 200) || undefined,
        selectorPart: selectorPart(current),
      });
      current = current.parentElement;
    }
    return {
      frame: 'top',
      tag: element.tagName.toLowerCase(),
      text: clip(element.innerText || element.textContent || ''),
      selector: buildSelector(element),
      path: ancestry.map((entry) => entry.tag).join(' > '),
      bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      center: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 },
      attributes,
      computedStyle: {
        display: style.display,
        position: style.position,
        color: style.color,
        backgroundColor: style.backgroundColor,
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        lineHeight: style.lineHeight,
        zIndex: style.zIndex,
      },
      ancestry,
    };
  };

  const hoverKeyForTarget = (target) => {
    if (!target) return '';
    const bounds = target.bounds || {};
    return [target.selector, Math.round(bounds.x), Math.round(bounds.y), Math.round(bounds.width), Math.round(bounds.height)].join('|');
  };

  const sendHover = (event) => {
    if (!inspectMode) return;
    pendingHover = event;
    if (window.__openchamberPreviewHoverFrame) return;
    window.__openchamberPreviewHoverFrame = window.requestAnimationFrame(() => {
      window.__openchamberPreviewHoverFrame = 0;
      const currentEvent = pendingHover;
      pendingHover = null;
      if (!currentEvent || !inspectMode) return;
      const element = document.elementFromPoint(currentEvent.clientX, currentEvent.clientY);
      const target = metadataForElement(element);
      const key = hoverKeyForTarget(target);
      if (key === lastHoverKey) return;
      lastHoverKey = key;
      post({ type: 'hover', target, pointer: { x: currentEvent.clientX, y: currentEvent.clientY }, ts: Date.now() });
    });
  };

  const setInspectMode = (enabled) => {
    inspectMode = Boolean(enabled);
    lastHoverKey = '';
    document.documentElement.style.cursor = inspectMode ? 'crosshair' : '';
    if (!inspectMode) {
      post({ type: 'hover', target: null, pointer: { x: 0, y: 0 }, ts: Date.now() });
    }
  };

  for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
    const original = console[level];
    console[level] = function() {
      const args = Array.prototype.slice.call(arguments);
      if (level === 'debug' && typeof args[0] === 'string' && args[0].indexOf('[vite]') === 0) {
        return original.apply(console, args);
      }
      if (isInternalDevToolConsoleNoise(level, args)) {
        return original.apply(console, args);
      }
      post({ type: 'console', level, args: args.map(stringifyArg), ts: Date.now() });
      return original.apply(console, args);
    };
  }

  installViteHmrProxyPatch();
  installAppRequestProxyPatch();

  window.addEventListener('error', (event) => {
    const target = event.target;
    if (target && target !== window && target.nodeType === Node.ELEMENT_NODE) {
      const url = readElementUrl(target);
      if (isInternalDevToolResource(target, url)) {
        return;
      }
      post({
        type: 'resource-error',
        tag: target.tagName.toLowerCase(),
        url: clip(url, 1000),
        outerHTML: clip(target.outerHTML || '', 1000),
        ts: Date.now(),
      });
      return;
    }
    if (isInternalDevToolRuntimeError(event.filename)) {
      return;
    }
    post({
      type: 'runtime-error',
      message: clip(event.message || 'Unknown error', 1000),
      stack: clip(event.error && event.error.stack ? event.error.stack : '', 2000) || undefined,
      filename: event.filename,
      line: event.lineno,
      column: event.colno,
      ts: Date.now(),
    });
  }, true);

  window.addEventListener('unhandledrejection', (event) => {
    post({
      type: 'runtime-error',
      message: clip(event.reason && event.reason.message ? event.reason.message : event.reason || 'Unhandled promise rejection', 1000),
      stack: clip(event.reason && event.reason.stack ? event.reason.stack : '', 2000) || undefined,
      ts: Date.now(),
    });
  });

  window.addEventListener('message', (event) => {
    if (event.source !== window.parent) return;
    const data = event.data;
    if (!data || data.source !== 'openchamber-preview-parent' || data.version !== VERSION) return;
    if (data.type === 'set-inspect-mode') {
      setInspectMode(data.enabled === true);
    }
    if (data.type === 'set-color-scheme') {
      applyPreviewColorScheme(data.scheme);
    }
  });

  window.addEventListener('mousemove', sendHover, true);
  window.addEventListener('mouseleave', () => {
    if (!inspectMode) return;
    lastHoverKey = '';
    post({ type: 'hover', target: null, pointer: { x: 0, y: 0 }, ts: Date.now() });
  }, true);
  window.addEventListener('click', (event) => {
    const anchor = event.target && typeof event.target.closest === 'function' ? event.target.closest('a[href]') : null;
    if (anchor && !inspectMode) {
      const navigation = classifyNavigation(anchor.href);
      if (navigation.action === 'proxy' || navigation.action === 'external') {
        event.preventDefault();
        event.stopPropagation();
        post({ type: 'navigate-preview', url: navigation.url, navigation: navigation.action, ts: Date.now() });
        return;
      }
    }

    if (!inspectMode) return;
    event.preventDefault();
    event.stopPropagation();
    const element = document.elementFromPoint(event.clientX, event.clientY);
    const target = metadataForElement(element);
    if (target) {
      post({ type: 'select', target, pointer: { x: event.clientX, y: event.clientY }, ts: Date.now() });
    }
  }, true);

  window.addEventListener('DOMContentLoaded', () => {
    post({ type: 'ready', url: window.location.href, title: document.title || '' });
  });
  post({ type: 'ready', url: window.location.href, title: document.title || '' });
})();`

const parseCookieHeader = (cookieHeader) => {
  const result = new Map()
  if (typeof cookieHeader !== "string" || cookieHeader.length === 0) {
    return result
  }

  const parts = cookieHeader.split(";")
  for (const part of parts) {
    const idx = part.indexOf("=")
    if (idx <= 0) {
      continue
    }
    const key = part.slice(0, idx).trim()
    const value = part.slice(idx + 1).trim()
    if (!key) {
      continue
    }
    result.set(key, value)
  }
  return result
}

const buildCookie = ({ name, value, path, maxAgeSeconds, secure }) => {
  const chunks = [`${name}=${value}`]
  if (path) chunks.push(`Path=${path}`)
  if (typeof maxAgeSeconds === "number" && Number.isFinite(maxAgeSeconds)) {
    chunks.push(`Max-Age=${Math.max(0, Math.trunc(maxAgeSeconds))}`)
  }
  chunks.push("HttpOnly")
  chunks.push("SameSite=Lax")
  if (secure) chunks.push("Secure")
  return chunks.join("; ")
}

const stripProxyPrefix = (pathname, id) => {
  const prefix = `/api/preview/proxy/${id}`
  if (!pathname.startsWith(prefix)) {
    return pathname
  }
  const rest = pathname.slice(prefix.length)
  return rest.length === 0 ? "/" : rest
}

const removeRawQueryParam = (search, paramName) => {
  if (typeof search !== "string" || search.length <= 1) {
    return ""
  }
  const query = search.startsWith("?") ? search.slice(1) : search
  const parts = query.split("&").filter((part) => {
    const name = part.split("=", 1)[0] || ""
    try {
      return decodeURIComponent(name.replace(/\+/g, " ")) !== paramName
    } catch {
      return name !== paramName
    }
  })
  return parts.length > 0 ? `?${parts.join("&")}` : ""
}

export const buildPreviewProxyUpstreamPath = (rawUrl, id) => {
  const parsed = new URL(rawUrl || "", "http://localhost")
  const strippedPath = stripProxyPrefix(parsed.pathname, id)
  return `${strippedPath}${removeRawQueryParam(parsed.search, "ocPreview")}`
}

export const removeSensitivePreviewProxyHeaders = (proxyReq) => {
  if (!proxyReq || typeof proxyReq.removeHeader !== "function") {
    return
  }
  proxyReq.removeHeader("cookie")
  proxyReq.removeHeader("authorization")
  proxyReq.removeHeader("x-openchamber-ui-session")
}

// SSRF guard for the `allowExternal` path: refuse to proxy private, loopback and
// reserved addresses (incl. cloud-metadata 169.254.169.254). Operates on the
// WHATWG-normalized hostname, so decimal/hex/octal IPv4 forms are already canonical
// dotted-decimal here. NOTE: this blocks IP *literals* only — a hostname that
// resolves to a private IP (DNS rebinding) is not caught and would need
// resolve-time IP pinning. Loopback for local preview goes through the non-external
// path (allowExternal=false), which is unaffected.
const isBlockedExternalHost = (hostname) => {
  if (!hostname) return true
  let host = hostname.toLowerCase()
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1)

  // The WHATWG parser keeps a fully-qualified name's root dot (`localhost.`, `svc.localhost.`)
  // and the resolver reads it as the same name, so the rules below have to see the name without
  // it; otherwise every name check misses and the loopback is proxied as an external host.
  host = host.replace(/\.+$/, "")
  if (!host) return true

  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true

  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (v4) {
    const a = Number(v4[1])
    const b = Number(v4[2])
    if (a === 0 || a === 127 || a === 10) return true // this-host / loopback / private
    if (a === 169 && b === 254) return true // link-local incl. cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true // private
    if (a === 192 && b === 168) return true // private
    if (a === 100 && b >= 64 && b <= 127) return true // carrier-grade NAT
    return false
  }

  if (host.includes(":")) {
    if (host === "::1" || host === "::") return true // loopback / unspecified
    if (host.startsWith("fe80")) return true // link-local
    if (host.startsWith("fc") || host.startsWith("fd")) return true // unique local fc00::/7
    // An IPv6 address that carries an IPv4 address reaches it, however it is written:
    // `::ffff:127.0.0.1`, `::ffff:7f00:1` and the expanded `0:0:0:0:0:ffff:7f00:1`. Matching the
    // text (`::ffff:`) let the expanded form through as an external host while the OS routed it to
    // the loopback it names, so the address is expanded and the IPv4 rules decide.
    const carried = ipv4CarriedByIpv6(host)
    if (carried) return isBlockedExternalHost(carried)
    return false
  }

  return false
}

// The IPv4 address an IPv6 address carries, or null when it carries none. That is the IPv4-mapped
// form (`::ffff:127.0.0.1`, `::ffff:7f00:1`, `0:0:0:0:0:ffff:7f00:1`), which the OS routes to the
// IPv4 address it names, and the deprecated IPv4-compatible form (`::7f00:1`), which it does not —
// refused all the same, so no reader has to know which of the two is still routed. The address is
// expanded to its eight groups, so the check does not depend on how the text was shortened.
const ipv4CarriedByIpv6 = (host) => {
  if (!host.includes(":")) return null

  const [head, tail, ...extra] = host.split("::")
  if (extra.length > 0) return null

  const withEmbeddedIpv4 = (groups) => {
    const last = groups[groups.length - 1]
    if (!last || !last.includes(".")) return groups
    const octets = last.split(".")
    if (octets.length !== 4 || octets.some((octet) => !/^\d{1,3}$/.test(octet) || Number(octet) > 255)) {
      return null
    }
    const values = octets.map(Number)
    return [
      ...groups.slice(0, -1),
      ((values[0] << 8) | values[1]).toString(16),
      ((values[2] << 8) | values[3]).toString(16),
    ]
  }

  const headGroups = head.length > 0 ? head.split(":") : []
  const tailGroups = tail === undefined || tail.length === 0 ? [] : tail.split(":")
  const missing = 8 - headGroups.length - tailGroups.length
  if (missing < 0 || (tail === undefined && missing !== 0)) return null

  const groups = withEmbeddedIpv4([...headGroups, ...Array(missing).fill("0"), ...tailGroups])
  if (!groups || groups.length !== 8) return null

  const values = []
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null
    values.push(Number.parseInt(group, 16))
  }
  const mapped = values.slice(0, 5).every((value) => value === 0) && values[5] === 0xffff
  const compatible = values.slice(0, 6).every((value) => value === 0)
  if (!mapped && !compatible) return null

  return `${values[6] >> 8}.${values[6] & 0xff}.${values[7] >> 8}.${values[7] & 0xff}`
}

export const normalizeProxyTargetUrl = (rawUrl, { allowExternal = false } = {}) => {
  let url
  try {
    url = new URL(rawUrl)
  } catch {
    return { ok: false, error: "Invalid URL" }
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "Only http(s) URLs are supported" }
  }

  const hostname = url.hostname
  if (!allowExternal) {
    if (!isLoopbackHost(hostname)) {
      return { ok: false, error: "Only loopback hosts are supported" }
    }
  } else if (isBlockedExternalHost(hostname)) {
    return { ok: false, error: "Refusing to proxy private or reserved addresses" }
  }

  const port = url.port ? Number.parseInt(url.port, 10) : url.protocol === "https:" ? 443 : 80
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    return { ok: false, error: "Invalid port" }
  }

  // Normalize common loopback hostnames to IPv4 to avoid environments where
  // `localhost` resolves to ::1 but the dev server only binds IPv4.
  if (
    LOOPBACK_HOSTS.has(hostname) &&
    (hostname === "0.0.0.0" || hostname === "localhost" || hostname === "::1" || hostname === "[::1]")
  ) {
    url.hostname = "127.0.0.1"
  }

  // Only keep origin here; the proxy path is preserved on the OpenChamber side.
  return { ok: true, origin: url.origin }
}

const normalizeLoopbackUrl = (rawUrl) => normalizeProxyTargetUrl(rawUrl, { allowExternal: false })

export const rewritePreviewBody = ({ bodyText, proxyBasePath, targetOrigin, kind }) => {
  if (typeof bodyText !== "string" || bodyText.length === 0) {
    return bodyText
  }

  const prefix = proxyBasePath.endsWith("/") ? proxyBasePath.slice(0, -1) : proxyBasePath
  const target = targetOrigin ? new URL(targetOrigin) : null
  const isSameTargetOrigin = (url) => {
    if (!target) return false
    if (url.protocol !== "http:" && url.protocol !== "https:") return false
    if (url.origin === target.origin) return true

    const host = url.hostname
    if (!isLoopbackHost(host)) {
      return false
    }
    return url.port === target.port
  }
  const rewriteResourceUrl = (value) => {
    if (typeof value !== "string" || value.length === 0) return value
    // A protocol-relative URL resolves against the app's scheme straight to the dev server. It carries no base of
    // its own, so it is parsed with one to decide whether it is the target, then rewritten like any other.
    if (value.startsWith("//")) {
      try {
        // The target's scheme, not a fixed http: an https target's protocol-relative URL never matched
        // otherwise, and the resource loaded straight from the site.
        const parsed = new URL(`${target ? target.protocol : "http:"}${value}`)
        if (isSameTargetOrigin(parsed)) {
          return `${prefix}${parsed.pathname}${parsed.search}${parsed.hash}`
        }
      } catch {}
      return value
    }
    if (value.startsWith("/")) {
      if (value.startsWith("/api/preview/proxy/")) return value
      return `${prefix}${value}`
    }
    try {
      const parsed = new URL(value)
      if (isSameTargetOrigin(parsed)) {
        return `${prefix}${parsed.pathname}${parsed.search}${parsed.hash}`
      }
    } catch {
      return value
    }
    return value
  }
  // Root-relative `url(...)` references, from a stylesheet or from inline CSS in a
  // `style` attribute or a `<style>` block: this proxy is same-origin, so the
  // browser would otherwise resolve them against the Desktop server instead of the
  // previewed one.
  const rewriteCssUrlReferences = (text) =>
    text.replace(/url\((['"]?)([^)'"]*)\1\)/gi, (_match, quote, value) => {
      const q = quote || ""
      return `url(${q}${rewriteResourceUrl(value)}${q})`
    })
  const rewriteMetaRefresh = (text) =>
    text.replace(/<meta\b[^>]*>/gi, (tag) => {
      if (!/http-equiv\s*=\s*(['"])refresh\1/i.test(tag)) return tag
      // content="0; url=/next" navigates the iframe; the browser would resolve /next on the Desktop origin.
      return tag.replace(/(\bcontent\s*=\s*)(['"])([^'"]*)\2/i, (match, head, quote, value) => {
        const rewritten = value.replace(/(\burl\s*=\s*)(['"]?)([^'";]*)\2/i, (inner, prefix, innerQuote, target) => {
          return `${prefix}${innerQuote}${rewriteResourceUrl(target)}${innerQuote}`
        })
        return `${head}${quote}${rewritten}${quote}`
      })
    })
  const rewriteHtml = (text) =>
    rewriteMetaRefresh(
      rewriteCssUrlReferences(text)
        .replace(/\b(src|href|action)=(['"])([^'"]*)\2/gi, (_match, attr, quote, value) => {
          return `${attr}=${quote}${rewriteResourceUrl(value)}${quote}`
        })
        .replace(/\bsrcset=(['"])([^'"]*)\1/gi, (_match, quote, value) => {
          const rewritten = String(value)
            .split(",")
            .map((part) => {
              const trimmed = part.trim()
              if (!trimmed) return trimmed
              const segments = trimmed.split(/\s+/)
              const url = segments[0] || ""
              segments[0] = rewriteResourceUrl(url)
              return segments.join(" ")
            })
            .join(", ")
          return `srcset=${quote}${rewritten}${quote}`
        }),
    )
  const rewriteCss = (text) =>
    rewriteCssUrlReferences(text).replace(/@import\s+(['"])\/(?!\/)([^'"]*)\1/gi, (_match, quote, path) => {
      return `@import ${quote}${rewriteResourceUrl(`/${path}`)}${quote}`
    })
  const rewriteJavaScript = (text) =>
    text
      .replace(/\bfrom\s+(['"])\/(?!\/)([^'"]*)\1/gi, (_match, quote, path) => {
        return `from ${quote}${rewriteResourceUrl(`/${path}`)}${quote}`
      })
      .replace(/\bimport\s+(['"])\/(?!\/)([^'"]*)\1/gi, (_match, quote, path) => {
        return `import ${quote}${rewriteResourceUrl(`/${path}`)}${quote}`
      })
      .replace(/\bimport\(\s*(['"])\/(?!\/)([^'"]*)\1\s*\)/gi, (_match, quote, path) => {
        return `import(${quote}${rewriteResourceUrl(`/${path}`)}${quote})`
      })

  if (kind === "html") return rewriteHtml(bodyText)
  if (kind === "css") return rewriteCss(bodyText)
  if (kind === "javascript") return rewriteJavaScript(bodyText)
  return bodyText
}

export const createPreviewProxyRuntime = ({ crypto, URL, createProxyMiddleware, responseInterceptor }) => {
  const targets = new Map()
  let sweepTimer = null

  const now = () => Date.now()

  const sweepExpired = () => {
    const t = now()
    for (const [id, entry] of targets.entries()) {
      if (entry.expiresAt <= t) {
        targets.delete(id)
      }
    }
  }

  const ensureSweeper = () => {
    if (sweepTimer) {
      return
    }
    sweepTimer = setInterval(sweepExpired, 30_000)
    // Don't keep the process alive.
    sweepTimer.unref?.()
  }

  const createTarget = (
    origin,
    ttlMs,
    { token: inheritedToken, expiresAt: inheritedExpiresAt, external = false } = {},
  ) => {
    const id = crypto.randomBytes(16).toString("hex")
    const token = inheritedToken || crypto.randomBytes(16).toString("hex")
    const createdAt = now()
    const expiresAt = Number.isFinite(inheritedExpiresAt)
      ? inheritedExpiresAt
      : createdAt + (Number.isFinite(ttlMs) ? Math.max(15_000, Math.trunc(ttlMs)) : DEFAULT_TARGET_TTL_MS)
    targets.set(id, {
      id,
      origin,
      token,
      createdAt,
      expiresAt,
      external: Boolean(external),
    })
    return { id, token, expiresAt }
  }

  const resolveTargetFromRequest = (req) => {
    const rawUrl = req?.originalUrl || req?.url || ""
    const parsed = new URL(rawUrl, "http://localhost")
    const pathname = parsed.pathname || ""

    const match = pathname.match(/^\/api\/preview\/proxy\/([a-f0-9]{16,64})(?:\/|$)/i)
    const id = match?.[1] || ""
    if (!id) {
      return { ok: false, status: 404, error: "Preview target not found" }
    }

    const entry = targets.get(id)
    if (!entry || entry.expiresAt <= now()) {
      targets.delete(id)
      return { ok: false, status: 404, error: "Preview target expired" }
    }

    const cookies = parseCookieHeader(req.headers?.cookie)
    const token = cookies.get(TOKEN_COOKIE_NAME) || ""
    if (!token || token !== entry.token) {
      return { ok: false, status: 403, error: "Preview token missing" }
    }

    return { ok: true, id, entry, parsed }
  }

  const removeFrameAncestorsDirective = (cspValue) =>
    String(cspValue)
      .split(",")
      .map((policy) => removeCspDirective(policy.trim(), "frame-ancestors"))
      .filter((policy) => typeof policy === "string" && policy.trim().length > 0)
      .join(", ")

  // Drop response headers that prevent the dev server from being framed.
  // The proxy itself is same-origin, so embedding is otherwise safe.
  const stripFrameBustingHeaders = (headers) => {
    if (!headers || typeof headers !== "object") {
      return
    }

    const headerKeys = Object.keys(headers)
    for (const key of headerKeys) {
      const lowerKey = key.toLowerCase()
      if (
        lowerKey === "x-frame-options" ||
        lowerKey === "service-worker-allowed" ||
        lowerKey === "clear-site-data" ||
        lowerKey === "refresh"
      ) {
        // All four act on the shared Desktop origin rather than the previewed page: a worker scope wider than
        // the proxy prefix, the app's cookies/storage/cache wiped by an untrusted response, and a navigation to
        // an internal host.
        delete headers[key]
        continue
      }
      if (lowerKey === "content-security-policy" || lowerKey === "content-security-policy-report-only") {
        const original = headers[key]
        const values = Array.isArray(original) ? original : [original]
        const rewritten = values
          .map((value) => removeFrameAncestorsDirective(value))
          .filter((value) => typeof value === "string" && value.length > 0)
        if (rewritten.length === 0) {
          delete headers[key]
        } else {
          headers[key] = Array.isArray(original) ? rewritten : rewritten[0]
        }
      }
    }
  }

  // Same as stripFrameBustingHeaders, but operates on the outgoing Express `res`.
  // Required because http-proxy-middleware v3 copies the upstream headers onto
  // `res` BEFORE the responseInterceptor callback runs, so mutating
  // `proxyRes.headers` afterward is a no-op — the frame-busting headers were
  // already queued on `res`. This is what actually lets a framed site load.
  // The same ordering `stripFrameBustingHeadersOnRes` exists for: http-proxy-middleware v3 copies the upstream
  // headers onto `res` before the interceptor callback runs, so a cache policy set on `proxyRes.headers` afterwards
  // never reached the browser and a rewritten preview body could be cached.
  const applyPreviewNoStoreOnRes = (res) => {
    if (!res || typeof res.setHeader !== "function") {
      return
    }
    res.setHeader("cache-control", "no-store, no-cache, must-revalidate, proxy-revalidate")
    res.setHeader("pragma", "no-cache")
    res.setHeader("expires", "0")
    if (typeof res.removeHeader === "function") {
      res.removeHeader("etag")
      res.removeHeader("last-modified")
    }
  }

  const stripFrameBustingHeadersOnRes = (res) => {
    if (!res || typeof res.removeHeader !== "function" || typeof res.getHeader !== "function") {
      return
    }
    res.removeHeader("x-frame-options")
    // A previewed page must not widen its service worker's scope past its own proxy prefix, nor wipe the app
    // origin's cookies/storage/cache, nor navigate the frame to an internal host.
    res.removeHeader("service-worker-allowed")
    res.removeHeader("clear-site-data")
    res.removeHeader("refresh")
    for (const name of ["content-security-policy", "content-security-policy-report-only"]) {
      const value = res.getHeader(name)
      if (value == null) {
        continue
      }
      const values = Array.isArray(value) ? value : [value]
      const rewritten = values
        .map((entry) => removeFrameAncestorsDirective(String(entry)))
        .filter((entry) => typeof entry === "string" && entry.length > 0)
      if (rewritten.length === 0) {
        res.removeHeader(name)
      } else {
        res.setHeader(name, Array.isArray(value) ? rewritten : rewritten[0])
      }
    }
  }

  // A redirect the proxy will not follow. The middleware already copied the upstream headers (and body) onto the
  // response, so both are replaced: a redirect body rendered as a document would run on the Desktop origin.
  const refuseRedirect = (res) => {
    if (res && typeof res.removeHeader === "function") {
      res.removeHeader("location")
      res.removeHeader("content-type")
      res.removeHeader("content-length")
      res.removeHeader("content-encoding")
      res.removeHeader("set-cookie")
      res.statusCode = 502
      // The middleware copied the upstream reason phrase too; the refusal owns the response now.
      res.statusMessage = "Bad Gateway"
    }
    if (res && typeof res.setHeader === "function") {
      res.setHeader("content-type", "text/plain; charset=utf-8")
    }
    return Buffer.from("Preview redirect refused")
  }

  // A preview's cookies keep working for the preview itself, but a Path=/ or a Domain the upstream chose would put
  // them on the Desktop origin, where the app's own session cookie lives. Scope every cookie to the target prefix.
  const scopePreviewCookies = (res, proxyBasePath) => {
    if (!res || typeof res.getHeader !== "function" || typeof res.setHeader !== "function") {
      return
    }
    const value = res.getHeader("set-cookie")
    if (value == null) {
      return
    }
    const values = Array.isArray(value) ? value : [value]
    const scoped = values.map((cookie) => {
      const withoutDomain = String(cookie).replace(/;\s*domain=[^;]*/gi, "")
      const withoutPath = withoutDomain.replace(/;\s*path=[^;]*/gi, "")
      return `${withoutPath}; Path=${proxyBasePath}`
    })
    res.setHeader("set-cookie", Array.isArray(value) ? scoped : scoped[0])
  }

  // Rewrite an upstream 3xx Location so the redirect stays inside the same-origin
  // proxy instead of escaping to the raw cross-origin URL (which the browser
  // would then frame-block). Cross-origin redirects must receive a new target:
  // mutating `resolved.entry.origin` would let a redirected subresource retarget
  // the page's shared proxy entry and break all subsequent requests.
  const rewriteProxyRedirectLocation = (location, resolved, requestPath = "/") => {
    try {
      const currentOrigin = resolved.entry.origin
      // A Location that is not an absolute reference resolves against the URL of the request
      // that produced it, not against the origin: the dev server's `intro` from `/docs/guide`
      // means `/docs/intro`, and `?page=2` keeps the path it redirected from. Resolving against
      // the bare origin sent the browser to `/intro` and `/?page=2`.
      // The request path is untrusted, and it must be a *path* of the base, not a relative reference:
      // one that begins with `//` would be read as a protocol-relative URL, so `Location: intro` from
      // `/api/preview/proxy/<id>//evil.example/x` resolved against http://evil.example/ and registered a
      // target for it. Assigning the path onto the origin keeps the host.
      const base = new URL(currentOrigin)
      const questionIndex = requestPath.indexOf("?")
      const requestPathname = questionIndex === -1 ? requestPath : requestPath.slice(0, questionIndex)
      base.pathname = requestPathname.startsWith("/") ? requestPathname : `/${requestPathname}`
      base.search = questionIndex === -1 ? "" : requestPath.slice(questionIndex)
      const abs = new URL(String(location), base)
      let targetId = resolved.id
      let redirectTarget = null
      if (abs.origin !== currentOrigin) {
        // A dev server that canonicalizes its own loopback name (localhost instead
        // of 127.0.0.1, or one of its other ports) is still the user's own server,
        // so a local preview may redirect within loopback; anything else has to be
        // a public host, which is all the external rule allows. Refusing a
        // loopback redirect would hand the raw Location to the browser and take
        // the document out of the proxy.
        const isLocalPreview = !resolved.entry.external
        const loopback = isLocalPreview
          ? normalizeProxyTargetUrl(abs.origin, { allowExternal: false })
          : { ok: false }
        const normalized = loopback.ok ? loopback : normalizeProxyTargetUrl(abs.origin, { allowExternal: true })
        if (!normalized.ok) {
          return null
        }
        if (normalized.origin === currentOrigin) {
          // The same target under another of its names: keep the entry, so the
          // path's cookie and the page's other requests stay valid.
          return {
            location: `/api/preview/proxy/${targetId}${abs.pathname}${abs.search}${abs.hash}`,
            redirectTarget: null,
          }
        }
        // A public host keeps the Desktop origin unless it is sandboxed, so it is
        // always marked external; a loopback target of a local preview is not.
        redirectTarget = createTarget(normalized.origin, resolved.entry.expiresAt - now(), {
          token: resolved.entry.token,
          expiresAt: resolved.entry.expiresAt,
          external: !loopback.ok,
        })
        targetId = redirectTarget.id
      }
      return {
        location: `/api/preview/proxy/${targetId}${abs.pathname}${abs.search}${abs.hash}`,
        redirectTarget,
      }
    } catch {
      return null
    }
  }

  // External previews are proxied from the app's own origin, so without this the
  // previewed page would run with the session cookie attached: its scripts could
  // call /api/fs, /api/terminal, … as the signed-in user. A `sandbox` directive
  // WITHOUT allow-same-origin makes the document an opaque origin, which turns
  // those same-origin calls into cross-site ones (the cookie is SameSite=Strict)
  // and hides document.cookie. Local dev previews keep the current behaviour:
  // they are the user's own server and often rely on same-origin storage.
  const EXTERNAL_PREVIEW_SANDBOX_CSP =
    "sandbox allow-scripts allow-forms allow-modals allow-popups allow-downloads allow-pointer-lock allow-presentation"

  const applyExternalPreviewSandbox = (res, resolved) => {
    if (!resolved?.entry?.external || !res || typeof res.setHeader !== "function") {
      return
    }
    const existing = typeof res.getHeader === "function" ? res.getHeader("content-security-policy") : null
    // A `sandbox` directive the upstream chose the flags for cannot be trusted: an external site is
    // attacker-controlled, it may ship `allow-same-origin`, and a second `sandbox` directive after
    // ours would be ignored. mergeExternalPreviewSandboxCsp drops theirs and adds the proxy's own,
    // keeping every other directive they sent.
    res.setHeader("content-security-policy", mergeExternalPreviewSandboxCsp(existing, EXTERNAL_PREVIEW_SANDBOX_CSP))
  }

  const attach = (
    app,
    { server, express, uiAuthController, isRequestOriginAllowed, rejectWebSocketUpgrade, markWebSocketUpgradeClaimed },
  ) => {
    ensureSweeper()

    const injectPreviewBridge = (bodyText, targetOrigin) => {
      if (typeof bodyText !== "string" || bodyText.includes(PREVIEW_BRIDGE_SCRIPT_ID)) {
        return bodyText
      }

      const targetOriginScript = `<script>window.__openchamberPreviewTargetOrigin=${JSON.stringify(targetOrigin || "")};</script>`
      const script = `${targetOriginScript}<script id="${PREVIEW_BRIDGE_SCRIPT_ID}">${PREVIEW_BRIDGE_SCRIPT}</script>`
      if (/<head(?:\s[^>]*)?>/i.test(bodyText)) {
        return bodyText.replace(/<head(\s[^>]*)?>/i, (match) => `${match}${script}`)
      }
      if (bodyText.includes("</body>")) {
        return bodyText.replace("</body>", `${script}</body>`)
      }
      return `${bodyText}${script}`
    }

    const rewriteViteClientHmr = (bodyText, proxyBasePath) => {
      if (typeof bodyText !== "string" || !bodyText.includes("vite-hmr")) {
        return bodyText
      }

      const base = proxyBasePath.endsWith("/") ? proxyBasePath : `${proxyBasePath}/`
      const escapedBase = JSON.stringify(base).slice(1, -1)
      return bodyText
        .replace(/const base\$1 = [^;]+;/, () => `const base$1 = ${JSON.stringify(base)};`)
        .replace(/const base = [^;]+;/, () => `const base = ${JSON.stringify(base)};`)
        .replace(/const hmrPort = [^;]+;/, () => "const hmrPort = importMetaUrl.port;")
        .replace(
          /const socketHost = [^;]+;/,
          () =>
            `const socketHost = \`\${importMetaUrl.hostname}\${importMetaUrl.port ? ':' + importMetaUrl.port : ''}${escapedBase}\`;`,
        )
        .replace(/const directSocketHost = [^;]+;/, () => "const directSocketHost = socketHost;")
        .replace(
          /const socketHost = `\$\{[^;]+?;\nconst directSocketHost = [^;]+;/s,
          () =>
            `const socketHost = \`\${importMetaUrl.hostname}\${importMetaUrl.port ? ':' + importMetaUrl.port : ''}${escapedBase}\`;\nconst directSocketHost = socketHost;`,
        )
    }

    app.post("/api/preview/targets", express.json(), async (req, res) => {
      try {
        // Origin validation is independent of UI auth (see the WebSocket
        // upgrade paths); it blocks cross-site browser POSTs even when no UI
        // password is set.
        const originAllowed = await isRequestOriginAllowed(req)
        if (!originAllowed) {
          return res.status(403).json({ error: "Invalid origin" })
        }

        if (uiAuthController?.enabled) {
          const sessionToken = await uiAuthController?.ensureSessionToken?.(req, res)
          if (!sessionToken) {
            return res.status(401).json({ error: "UI authentication required" })
          }
        }

        const rawUrl = typeof req.body?.url === "string" ? req.body.url.trim() : ""
        if (!rawUrl) {
          return res.status(400).json({ error: "url is required" })
        }

        const ttlMs = typeof req.body?.ttlMs === "number" ? req.body.ttlMs : DEFAULT_TARGET_TTL_MS
        const allowExternal = req.body?.allowExternal === true
        const normalized = allowExternal
          ? normalizeProxyTargetUrl(rawUrl, { allowExternal: true })
          : normalizeLoopbackUrl(rawUrl)
        if (!normalized.ok) {
          return res.status(400).json({ error: normalized.error })
        }

        const target = createTarget(normalized.origin, ttlMs, { external: allowExternal })
        const cookiePath = `/api/preview/proxy/${target.id}`
        const secure = Boolean(req.secure)
        res.setHeader(
          "Set-Cookie",
          buildCookie({
            name: TOKEN_COOKIE_NAME,
            value: target.token,
            path: cookiePath,
            maxAgeSeconds: Math.round((target.expiresAt - now()) / 1000),
            secure,
          }),
        )

        return res.json({
          id: target.id,
          proxyBasePath: cookiePath,
          expiresAt: target.expiresAt,
        })
      } catch (error) {
        console.error("[preview-proxy] Failed to create target:", error)
        return res.status(500).json({ error: "Failed to create preview target" })
      }
    })

    const proxy = createProxyMiddleware({
      target: "http://127.0.0.1",
      changeOrigin: true,
      // Deliberately NOT `ws: true`. With it, http-proxy-middleware subscribes its own `upgrade`
      // listener to the HTTP server as soon as any HTTP request flows through the middleware, and
      // from then on its public `upgrade()` becomes a no-op while that listener proxies every
      // matching upgrade itself — without the origin and UI-auth checks in our own handler below
      // (which run after an await, so they race it instead of gating it). Leaving it off keeps the
      // handler below the only path for preview upgrades; `proxy.upgrade()` still works, because
      // the library exposes it for exactly this external-upgrade case.
      ws: false,
      selfHandleResponse: true,
      // Restrict the proxy to preview paths. Without this, every WebSocket upgrade on the server
      // (e.g. `/api/terminal/ws`) would be proxied to `http://127.0.0.1`.
      //
      // We use a function so the same filter handles both cases:
      //   - HTTP requests through Express, where `req.url` has been stripped
      //     of the `/api/preview/proxy` mount-point, so we check `originalUrl`.
      //   - Raw upgrade events from the HTTP server, where `req.url` still
      //     contains the full path.
      pathFilter: (pathname, req) => {
        const target = req?.originalUrl || pathname || req?.url || ""
        return target.startsWith("/api/preview/proxy/")
      },
      router: (req) => {
        const resolved = resolveTargetFromRequest(req)
        if (!resolved.ok) {
          return "http://127.0.0.1"
        }
        return resolved.entry.origin
      },
      pathRewrite: (pathValue, req) => {
        const resolved = resolveTargetFromRequest(req)
        if (!resolved.ok) {
          return pathValue
        }

        // Never forward our auth cookie token or internal reload nonce to the dev server.
        return buildPreviewProxyUpstreamPath(req.originalUrl || req.url || "", resolved.id)
      },
      on: {
        proxyReq: (proxyReq) => {
          // Keep local dev servers from receiving OpenChamber credentials.
          removeSensitivePreviewProxyHeaders(proxyReq)
          proxyReq.setHeader("accept-encoding", "identity")
        },
        proxyReqWs: (proxyReq) => {
          removeSensitivePreviewProxyHeaders(proxyReq)
        },
        proxyRes: responseInterceptor(async (responseBuffer, proxyRes, req, res) => {
          // Allow the site to be framed inside OpenChamber even if it sets
          // X-Frame-Options or a CSP frame-ancestors rule. The proxy is
          // same-origin so embedding is otherwise safe. Strip on `res` (not
          // proxyRes.headers) — see stripFrameBustingHeadersOnRes for why.
          stripFrameBustingHeaders(proxyRes.headers)
          stripFrameBustingHeadersOnRes(res)

          const resolved = resolveTargetFromRequest(req)
          // Upstream cookies keep working for the preview but must not land on the Desktop origin itself, where a
          // guessable session cookie name could be clobbered.
          if (resolved.ok) {
            scopePreviewCookies(res, `/api/preview/proxy/${resolved.id}`)
          }

          // Keep redirects inside the same-origin proxy so a cross-origin hop
          // (e.g. google.com -> www.google.com) doesn't escape and get
          // frame-blocked by the target's own X-Frame-Options.
          const statusCode = proxyRes.statusCode || (res && res.statusCode) || 0
          if (statusCode >= 300 && statusCode < 400) {
            // Even a 3xx body can be rendered (a 300, or a redirect block a browser ignores), so it gets the
            // document protections before anything returns. An expired entry cannot be sandboxed from its own
            // record, so it is refused outright instead of shipping the upstream body.
            applyExternalPreviewSandbox(res, resolved)
            applyPreviewNoStoreOnRes(res)
            if (!resolved.ok) {
              return refuseRedirect(res)
            }
            const location = proxyRes.headers?.location
            if (location && res && typeof res.setHeader === "function") {
              // The request's own upstream path is the base a relative Location resolves
              // against (RFC 9110): `intro` from `/docs/guide` means `/docs/intro`.
              const requestUrl = new URL(req.originalUrl || req.url || "", "http://localhost")
              const rewritten = rewriteProxyRedirectLocation(
                location,
                resolved,
                `${stripProxyPrefix(requestUrl.pathname, resolved.id)}${requestUrl.search}`,
              )
              if (rewritten) {
                res.setHeader("location", rewritten.location)
                if (rewritten.redirectTarget) {
                  const cookie = buildCookie({
                    name: TOKEN_COOKIE_NAME,
                    value: rewritten.redirectTarget.token,
                    path: `/api/preview/proxy/${rewritten.redirectTarget.id}`,
                    maxAgeSeconds: Math.max(0, Math.round((rewritten.redirectTarget.expiresAt - now()) / 1000)),
                    secure: Boolean(req.secure),
                  })
                  const existing = res.getHeader?.("set-cookie")
                  const values = existing == null ? [] : Array.isArray(existing) ? existing : [existing]
                  res.setHeader("set-cookie", [...values, cookie])
                }
              } else {
                return refuseRedirect(res)
              }
            }
            return responseBuffer
          }

          // Node joins two Content-Type lines into "text/html, text/plain". Both the rewriting decisions and the
          // sandbox decision read the same list of essences, or the loose one would inject the bridge into a page
          // the strict one left unsandboxed.
          const contentType = String(proxyRes.headers?.["content-type"] || "").toLowerCase()
          const essenceList = contentType
            .split(",")
            .map((part) => part.split(";", 1)[0].trim())
          const isHtml = essenceList.includes("text/html")
          const isCss = essenceList.includes("text/css")
          const isJavaScript = essenceList.some(
            (essence) => essence.includes("javascript") || essence.includes("ecmascript"),
          )
          // A document that runs script when it is opened directly. HTML is not the only one: an SVG, XHTML or XML
          // response from an external preview is a document too, and all were served with the app's own policy —
          // which allows inline script — on the Desktop origin. Chrome renders any `*/*+xml` as XML and sniffs a
          // missing content type as HTML, so the essence decides rather than a list of exact types. The
          // project-icon route carries its own policy for the same reason (`60cfcf9c`).
          const isScriptableDocument = essenceList.some(
            (essence) =>
              essence === "" ||
              essence === "text/html" ||
              essence === "image/svg+xml" ||
              essence === "application/xml" ||
              essence === "text/xml" ||
              essence.endsWith("+xml"),
          )
          if (isScriptableDocument) {
            applyExternalPreviewSandbox(res, resolved)
          }
          if (!isHtml && !isCss && !isJavaScript) {
            return responseBuffer
          }

          applyPreviewNoStoreOnRes(res)

          if (!resolved.ok) {
            return responseBuffer
          }

          const proxyBasePath = `/api/preview/proxy/${resolved.id}`
          const parsed = new URL(req.originalUrl || req.url || "", "http://localhost")
          const upstreamPath = stripProxyPrefix(parsed.pathname, resolved.id)
          if (isJavaScript && upstreamPath === "/@vite/client") {
            return rewritePreviewBody({
              bodyText: rewriteViteClientHmr(responseBuffer.toString("utf8"), proxyBasePath),
              proxyBasePath,
              targetOrigin: resolved.entry.origin,
              kind: "javascript",
            })
          }

          const rewrittenBody = rewritePreviewBody({
            bodyText: responseBuffer.toString("utf8"),
            proxyBasePath,
            targetOrigin: resolved.entry.origin,
            kind: isHtml ? "html" : isCss ? "css" : "javascript",
          })
          if (isHtml) {
            return injectPreviewBridge(rewrittenBody, resolved.entry.origin)
          }
          return rewrittenBody
        }),
        error: (err, _req, res) => {
          const isDev =
            typeof process !== "undefined" && process && process.env && process.env.NODE_ENV !== "production"

          const message =
            err && typeof err === "object" && typeof err.message === "string" ? err.message : "Unknown proxy error"

          console.error("[preview-proxy] proxy error:", message)

          if (res && !res.headersSent && typeof res.status === "function") {
            const payload = { error: "Preview proxy error" }

            if (isDev) {
              try {
                const resolved = resolveTargetFromRequest(_req)
                payload.details = {
                  message,
                  code: err && typeof err === "object" ? err.code : undefined,
                  targetOrigin: resolved?.ok ? resolved.entry.origin : undefined,
                }
              } catch {
                payload.details = { message }
              }
            }

            res.status(502).json(payload)
          }
        },
      },
    })

    app.use(
      "/api/preview/proxy",
      (req, res, next) => {
        const resolved = resolveTargetFromRequest(req)
        if (!resolved.ok) {
          res.setHeader(PREVIEW_REFUSAL_HEADER, "1")
          return res.status(resolved.status).json({ error: resolved.error })
        }
        next()
      },
      proxy,
    )

    server.on("upgrade", (req, socket, head) => {
      // Not the preview proxy: the terminal, event-stream and renderer upgrade handlers own it.
      if (!(req.originalUrl || req.url || "").startsWith("/api/preview/proxy/")) {
        return
      }
      markWebSocketUpgradeClaimed(socket)

      const resolved = resolveTargetFromRequest(req)
      if (!resolved.ok) {
        // Answer the upgrade. Nothing else proxies preview paths any more (see `ws: false` above),
        // so returning silently would leave the socket hanging until the client gives up.
        rejectWebSocketUpgrade(socket, resolved.status, resolved.error)
        return
      }

      const handleUpgrade = async () => {
        try {
          // Origin validation is independent of UI auth (see the other
          // WebSocket upgrade paths); it must run even when no UI password
          // is set.
          const originAllowed = await isRequestOriginAllowed(req)
          if (!originAllowed) {
            rejectWebSocketUpgrade(socket, 403, "Invalid origin")
            return
          }

          if (uiAuthController?.enabled) {
            const sessionToken = await uiAuthController?.ensureSessionToken?.(req, null)
            if (!sessionToken) {
              rejectWebSocketUpgrade(socket, 401, "UI authentication required")
              return
            }
          }

          // Rewrite req.url to what the dev server expects.
          const rawUrl = req.url || ""
          req.originalUrl = rawUrl
          req.url = buildPreviewProxyUpstreamPath(rawUrl, resolved.id)
          proxy.upgrade(req, socket, head)
        } catch {
          rejectWebSocketUpgrade(socket, 500, "Upgrade failed")
        }
      }

      void handleUpgrade()
    })
  }

  const dispose = () => {
    if (sweepTimer) {
      clearInterval(sweepTimer)
      sweepTimer = null
    }
    targets.clear()
  }

  return {
    attach,
    dispose,
  }
}
