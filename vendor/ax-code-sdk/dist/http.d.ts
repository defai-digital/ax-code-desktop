/**
 * HTTP-server-based ax-code client.
 *
 * This was the default export in @ax-code/sdk@1.4.0. In 2.0.0 it
 * moved to `@ax-code/sdk/http` — the new default is the in-process
 * `createAgent` from `@ax-code/sdk`.
 *
 * @example
 * ```ts
 * import { createAxCode } from "@ax-code/sdk/http"
 *
 * const { client, server } = await createAxCode()
 * const sessions = await client.session.list()
 * ```
 */
export * from "./client.js";
export * from "./server.js";
import type { ServerOptions } from "./server.js";
export declare function createAxCode(options?: ServerOptions): Promise<{
    client: import("./client.js").OpencodeClient;
    server: {
        url: string;
        headers: {
            Authorization: string;
        };
        close(): void;
    };
}>;
export declare const createOpencode: typeof createAxCode;
