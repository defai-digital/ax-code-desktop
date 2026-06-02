export declare const REQUIRED_OPENAPI_PATHS: readonly ["/global/health", "/event", "/session", "/session/{sessionID}", "/session/{sessionID}/prompt_async", "/permission", "/permission/{requestID}/reply", "/provider"];
export declare function parseOpenApiSnapshot(source: string): unknown;
export declare function validateOpenApiSnapshot(input: unknown): string[];
