export type HeadlessBackendOptions = {
    directory?: string;
    hostname?: string;
    port?: number;
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
export type HeadlessBackendHandle = {
    url: string;
    headers: Record<string, string>;
    closed: Promise<void>;
    close(): Promise<void>;
};
export declare function startHeadlessBackend(options?: HeadlessBackendOptions): Promise<HeadlessBackendHandle>;
