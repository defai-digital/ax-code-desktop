import { z } from "zod";
export declare const HeadlessStreamHealthSchema: z.ZodEnum<{
    error: "error";
    connected: "connected";
    fixture: "fixture";
    connecting: "connecting";
    unavailable: "unavailable";
}>;
export type HeadlessStreamHealthValue = z.infer<typeof HeadlessStreamHealthSchema>;
export declare const AppErrorEnvelopeSchema: z.ZodObject<{
    name: z.ZodString;
    message: z.ZodString;
    status: z.ZodNumber;
    code: z.ZodOptional<z.ZodString>;
    logRef: z.ZodOptional<z.ZodString>;
    retryable: z.ZodOptional<z.ZodBoolean>;
    details: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.core.$strict>;
export type AppErrorEnvelopeLike = z.infer<typeof AppErrorEnvelopeSchema>;
export declare const DesktopDiagnosticExportSchema: z.ZodObject<{
    appVersion: z.ZodString;
    platform: z.ZodString;
    backendMode: z.ZodEnum<{
        sidecar: "sidecar";
        attached: "attached";
    }>;
    backendHealth: z.ZodEnum<{
        unknown: "unknown";
        unavailable: "unavailable";
        starting: "starting";
        healthy: "healthy";
    }>;
    streamHealth: z.ZodEnum<{
        error: "error";
        connected: "connected";
        fixture: "fixture";
        connecting: "connecting";
        unavailable: "unavailable";
    }>;
    logRefs: z.ZodArray<z.ZodString>;
    recentErrors: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        message: z.ZodString;
        status: z.ZodNumber;
        code: z.ZodOptional<z.ZodString>;
        logRef: z.ZodOptional<z.ZodString>;
        retryable: z.ZodOptional<z.ZodBoolean>;
        details: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type DesktopDiagnosticExport = z.infer<typeof DesktopDiagnosticExportSchema>;
export declare function parseDesktopDiagnosticExport(input: unknown): DesktopDiagnosticExport;
export declare function redactDiagnosticValue(input: unknown): unknown;
