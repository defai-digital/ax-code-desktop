export * from "./client.js";
export * from "./server.js";
import { createAxCodeClient } from "./client.js";
import { createAxCodeServer } from "./server.js";
export async function createAxCode(options) {
    const server = await createAxCodeServer({
        ...options,
    });
    const client = createAxCodeClient({
        baseUrl: server.url,
        headers: server.headers,
    });
    return {
        client,
        server,
    };
}
export const createOpencode = createAxCode;
