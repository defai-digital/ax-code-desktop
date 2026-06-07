/**
 * @ax-code/sdk/headless — App-oriented headless SDK for AX Code.
 *
 * Use this entry point to start or attach to a local AX Code backend,
 * subscribe to typed events, project state, and manage backend lifecycle.
 *
 * @example
 * ```ts
 * import {
 *   startHeadlessBackend,
 *   createHeadlessClient,
 *   createHeadlessProjectionState,
 *   applyHeadlessProjectionEvent,
 * } from "@ax-code/sdk/headless"
 *
 * const backend = await startHeadlessBackend({ directory: "/path/to/workspace" })
 * try {
 *   const client = createHeadlessClient({ baseUrl: backend.url, headers: backend.headers })
 *   const state = createHeadlessProjectionState()
 *   const session = await client.createSession({ title: "App session" })
 *   // subscribe to events and apply to state...
 * } finally {
 *   await backend.close()
 * }
 * ```
 */
export { startHeadlessBackend } from "./headless/lifecycle.js";
export { createHeadlessClient, parseHeadlessRuntimeJsonBody, parseHeadlessRuntimeResponseBody, } from "./headless/client.js";
export { createHeadlessProjectionState, applyHeadlessProjectionEvent, runtimeProbeKeysForEvent, } from "./headless/projection.js";
export { AppErrorEnvelopeSchema, DesktopDiagnosticExportSchema, HeadlessStreamHealthSchema, parseDesktopDiagnosticExport, redactDiagnosticValue, } from "./headless/diagnostics.js";
export { HEADLESS_RUNTIME_SCHEMA_VERSION, HEADLESS_RUNTIME_EVENT_TYPES, isHeadlessRuntimeEvent, } from "./headless/event.js";
export { commandAcceptsAsyncMode } from "./headless/command.js";
