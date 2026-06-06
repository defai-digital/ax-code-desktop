export const VSCODE_CONNECTION_STATUS_EVENT = 'openchamber:connection-status';

export type VSCodeConnectionStatus = 'connecting' | 'connected' | 'error' | 'disconnected';

export function normalizeVSCodeConnectionStatus(value: unknown): VSCodeConnectionStatus | null {
  return value === 'connecting' || value === 'connected' || value === 'error' || value === 'disconnected'
    ? value
    : null;
}

export function readVSCodeConnectionStatus(source: {
  __OPENCHAMBER_CONNECTION__?: {
    status?: unknown;
  };
} | null | undefined): VSCodeConnectionStatus | null {
  return normalizeVSCodeConnectionStatus(source?.__OPENCHAMBER_CONNECTION__?.status);
}

export function readWindowVSCodeConnectionStatus(): VSCodeConnectionStatus | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return readVSCodeConnectionStatus(window as unknown as {
    __OPENCHAMBER_CONNECTION__?: {
      status?: unknown;
    };
  });
}

export function parseVSCodeConnectionStatusEvent(event: Event): VSCodeConnectionStatus | null {
  const detail = 'detail' in event ? (event as CustomEvent<unknown>).detail : null;
  if (detail === null || typeof detail !== 'object' || Array.isArray(detail)) {
    return null;
  }
  return normalizeVSCodeConnectionStatus((detail as Record<string, unknown>).status);
}
