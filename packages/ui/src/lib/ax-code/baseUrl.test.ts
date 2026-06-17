import { describe, expect, test } from 'bun:test';

import { normalizeAxCodeSdkBaseUrl } from './baseUrl';

describe('normalizeAxCodeSdkBaseUrl', () => {
  test('keeps API-root base URLs unchanged', () => {
    expect(normalizeAxCodeSdkBaseUrl('/api')).toBe('/api');
    expect(normalizeAxCodeSdkBaseUrl('http://localhost:3001/api')).toBe('http://localhost:3001/api');
  });

  test('strips a stale config resource suffix from SDK base URLs', () => {
    expect(normalizeAxCodeSdkBaseUrl('/api/config')).toBe('/api');
    expect(normalizeAxCodeSdkBaseUrl('/api/config/')).toBe('/api');
    expect(normalizeAxCodeSdkBaseUrl('http://localhost:3001/api/config')).toBe('http://localhost:3001/api');
    expect(normalizeAxCodeSdkBaseUrl('http://localhost:3001/api/config/')).toBe('http://localhost:3001/api');
  });
});
