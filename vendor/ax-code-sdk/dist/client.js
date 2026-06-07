export * from "./gen/types.gen.js";
import { createClient } from "./gen/client/client.gen.js";
import { OpencodeClient } from "./gen/sdk.gen.js";
import { withDirectoryHeaders } from "./protocol.js";
export { OpencodeClient };
export { OpencodeClient as AxCodeClient };
export function createAxCodeClient(config) {
    if (!config?.fetch) {
        // Bun extends Request with a `timeout` property (false = no per-request
        // timeout). Disable it so SSE connections and long agent sessions are not
        // killed by Bun's default connection timeout.
        const noTimeoutFetch = ((input, init) => {
            if (input instanceof Request) {
                ;
                input.timeout = false;
                return fetch(input, init);
            }
            return fetch(input, { timeout: false, ...init });
        });
        config = {
            ...config,
            fetch: noTimeoutFetch,
        };
    }
    if (config?.directory) {
        config.headers = withDirectoryHeaders(config.headers, config.directory);
    }
    const client = createClient(config);
    return new OpencodeClient({ client });
}
export const createOpencodeClient = createAxCodeClient;
