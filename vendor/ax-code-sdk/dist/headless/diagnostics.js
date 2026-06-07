import { z } from "zod";
export const HeadlessStreamHealthSchema = z.enum(["fixture", "connecting", "connected", "unavailable", "error"]);
export const AppErrorEnvelopeSchema = z
    .object({
    name: z.string(),
    message: z.string(),
    status: z.number().int().min(400).max(599),
    code: z.string().optional(),
    logRef: z.string().optional(),
    retryable: z.boolean().optional(),
    details: z.record(z.string(), z.unknown()).optional(),
})
    .strict();
export const DesktopDiagnosticExportSchema = z
    .object({
    appVersion: z.string(),
    platform: z.string(),
    backendMode: z.enum(["sidecar", "attached"]),
    backendHealth: z.enum(["unknown", "starting", "healthy", "unavailable"]),
    streamHealth: HeadlessStreamHealthSchema,
    logRefs: z.array(z.string()),
    recentErrors: z.array(AppErrorEnvelopeSchema),
})
    .strict();
const SENSITIVE_KEY = /(?:token|secret|password|api[_-]?key|authorization|authheader|providerkey|backendpassword)/i;
const REDACTED = "[REDACTED]";
export function parseDesktopDiagnosticExport(input) {
    return DesktopDiagnosticExportSchema.parse(redactDiagnosticValue(input));
}
export function redactDiagnosticValue(input) {
    if (!input || typeof input !== "object")
        return input;
    if (Array.isArray(input))
        return input.map((item) => redactDiagnosticValue(item));
    return Object.fromEntries(Object.entries(input).map(([key, value]) => [
        key,
        SENSITIVE_KEY.test(key) ? REDACTED : redactDiagnosticValue(value),
    ]));
}
