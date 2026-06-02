import { type Config } from "./gen/types.gen.js";
export type ServerOptions = {
    hostname?: string;
    port?: number;
    /**
     * HTTP server helpers default to loopback-only. Set this only when the caller owns
     * transport security and authentication for a network-visible server.
     */
    allowNetworkBind?: boolean;
    signal?: AbortSignal;
    timeout?: number;
    config?: Config;
    auth?: {
        username?: string;
        password?: string;
    };
};
export type TuiOptions = {
    project?: string;
    model?: string;
    session?: string;
    agent?: string;
    signal?: AbortSignal;
    config?: Config;
};
export declare function createAxCodeServer(options?: ServerOptions): Promise<{
    url: string;
    headers: {
        Authorization: string;
    };
    close(): void;
}>;
export declare const createOpencodeServer: typeof createAxCodeServer;
export declare function createAxCodeTui(options?: TuiOptions): {
    close(): void;
};
export declare const createOpencodeTui: typeof createAxCodeTui;
