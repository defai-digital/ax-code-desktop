export * from "./gen/types.gen.js";
import { type Config } from "./gen/client/types.gen.js";
import { OpencodeClient } from "./gen/sdk.gen.js";
export { type Config as OpencodeClientConfig, OpencodeClient };
export { type Config as AxCodeClientConfig, OpencodeClient as AxCodeClient };
export declare function createAxCodeClient(config?: Config & {
    directory?: string;
    experimental_workspaceID?: string;
}): OpencodeClient;
export declare const createOpencodeClient: typeof createAxCodeClient;
