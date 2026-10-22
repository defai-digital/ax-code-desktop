export const WEBMCP_SENSITIVE_NAME: RegExp
export function webMcpFieldLooksSensitive(value: unknown): boolean
export function webMcpTextLooksSensitive(value: string): boolean
export function redactWebMcpReport(
  value: unknown,
  replacement?: string,
  options?: { onTruncate?: () => void },
): unknown
export function redactWebMcpText(value: string): string
export function webMcpDisplayKey(value: string): string
export function webMcpDisplayText(value: string): string
export function webMcpDisplayDescription(value: string): string
export function webMcpDisplayReport(value: unknown): unknown
export function webMcpDisplaySchema(value: unknown): unknown
export function webMcpSchemaLooksSensitive(schema: unknown): boolean
