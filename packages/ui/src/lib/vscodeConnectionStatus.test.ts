import { describe, expect, test } from 'bun:test';
import {
  normalizeVSCodeConnectionStatus,
  parseVSCodeConnectionStatusEvent,
  readVSCodeConnectionStatus,
} from './vscodeConnectionStatus';

describe('vscode connection status helpers', () => {
  test('normalizes supported status values', () => {
    expect(normalizeVSCodeConnectionStatus('connecting')).toBe('connecting');
    expect(normalizeVSCodeConnectionStatus('connected')).toBe('connected');
    expect(normalizeVSCodeConnectionStatus('error')).toBe('error');
    expect(normalizeVSCodeConnectionStatus('disconnected')).toBe('disconnected');
  });

  test('rejects unsupported status values', () => {
    expect(normalizeVSCodeConnectionStatus('ready')).toBeNull();
    expect(normalizeVSCodeConnectionStatus(undefined)).toBeNull();
  });

  test('reads status from injected window-like source', () => {
    expect(readVSCodeConnectionStatus({
      __OPENCHAMBER_CONNECTION__: { status: 'connected' },
    })).toBe('connected');

    expect(readVSCodeConnectionStatus({
      __OPENCHAMBER_CONNECTION__: { status: 'ready' },
    })).toBeNull();
  });

  test('parses status change event details', () => {
    expect(parseVSCodeConnectionStatusEvent(new CustomEvent('status', {
      detail: { status: 'error' },
    }))).toBe('error');

    expect(parseVSCodeConnectionStatusEvent(new CustomEvent('status', {
      detail: { status: 'ready' },
    }))).toBeNull();

    expect(parseVSCodeConnectionStatusEvent(new Event('status'))).toBeNull();
  });
});
