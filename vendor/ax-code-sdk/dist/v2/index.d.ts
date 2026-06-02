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
