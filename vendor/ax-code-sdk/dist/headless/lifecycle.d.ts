export type HeadlessBackendOptions = {
    directory?: string;
    hostname?: string;
    port?: number;
    /**
     * Executable used to start the backend. Defaults to `ax-code`.
     * App shells can pass an absolute binary path while keeping the SDK-owned
     * readiness, auth, diagnostics, and shutdown behavior.
     */
    binary?: string;
    /**
     * Full argument vector for the backend executable. When omitted, the SDK
     * launches `ax-code serve --hostname=<host> --port=<port>`.
     */
    args?: string[];
    /**
     * HTTP headless backend helpers are desktop compatibility fallbacks.
     * Network binds must be explicit so GUI apps do not accidentally expose the full HTTP API.
     */
    allowNetworkBind?: boolean;
    signal?: AbortSignal;
    timeout?: number;
    env?: Record<string, string>;
    onStdout?: (line: string) => void;
    onStderr?: (line: string) => void;
    /** @internal test seam for environments where loopback bind is sandboxed. */
    reservePort?: (hostname: string) => Promise<number>;
    config?: Record<string, unknown>;
    auth?: {
        username?: string;
        password?: string;
    };
    fetch?: typeof fetch;
};
export type HeadlessBackendDiagnostics = {
    launchedAt: string;
    binary: string;
    args: string[];
    cwd?: string;
    hostname: string;
    port: number;
    authUsername: string;
    envKeys: string[];
    readyUrl?: string;
    health?: {
        ok: boolean;
        status: number;
        body?: unknown;
        error?: string;
    };
    exit?: {
        code: number | null;
        signal: NodeJS.Signals | null;
        beforeReady: boolean;
    };
    capturedOutput?: string;
};
export type HeadlessBackendHandle = {
    url: string;
    headers: Record<string, string>;
    diagnostics: HeadlessBackendDiagnostics;
    closed: Promise<void>;
    close(): Promise<void>;
};
export declare class HeadlessBackendStartupError extends Error {
    readonly diagnostics: HeadlessBackendDiagnostics;
    constructor(message: string, diagnostics: HeadlessBackendDiagnostics, options?: ErrorOptions);
}
export declare function startHeadlessBackend(options?: HeadlessBackendOptions): Promise<HeadlessBackendHandle>;
