/**
 * Contract guard for the vendored @ax-code/sdk.
 *
 * This app mirrors a few SDK 2.2.0 internals (the loopback-bind guard and the
 * headless handle shape patch in lifecycle.js). When the vendored SDK is
 * updated these tests fail on purpose so the mirrored assumptions get
 * re-verified — see docs/AX_CODE_REVENDOR_CHECKLIST.md.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SDK_VERSION } from '@ax-code/sdk';
import { startHeadlessBackend } from '@ax-code/sdk/headless';
import { isSdkLoopbackHostname } from './lifecycle.js';

const EXPECTED_VENDORED_SDK_VERSION = '2.2.0';

const vendorPackageJson = JSON.parse(
  readFileSync(new URL('../../../../../vendor/ax-code-sdk/package.json', import.meta.url), 'utf8')
);

describe('vendored @ax-code/sdk contract', () => {
  it('is pinned to the version whose internals lifecycle.js mirrors', () => {
    expect(SDK_VERSION).toBe(EXPECTED_VENDORED_SDK_VERSION);
    expect(vendorPackageJson.version).toBe(EXPECTED_VENDORED_SDK_VERSION);
  });

  it('exposes every entry point this app imports', () => {
    const exportsMap = vendorPackageJson.exports ?? {};
    for (const entry of ['.', './v2', './v2/client', './headless']) {
      expect(exportsMap[entry], `missing SDK export "${entry}"`).toBeDefined();
    }
  });

  it('still provides startHeadlessBackend for the managed runtime', () => {
    expect(typeof startHeadlessBackend).toBe('function');
  });
});

describe('isSdkLoopbackHostname mirror', () => {
  // These fixtures must match the SDK's own loopback guard so that
  // allowNetworkBind is only set for explicitly non-loopback hostnames.
  it('treats loopback hostnames as loopback', () => {
    for (const hostname of ['localhost', 'LOCALHOST', '::1', '[::1]', '127.0.0.1', '127.5.5.5', '', undefined]) {
      expect(isSdkLoopbackHostname(hostname), `expected "${hostname}" to be loopback`).toBe(true);
    }
  });

  it('treats network hostnames as non-loopback', () => {
    for (const hostname of ['0.0.0.0', '192.168.1.10', '10.0.0.1', 'example.com', '128.0.0.1', '127.0.0']) {
      expect(isSdkLoopbackHostname(hostname), `expected "${hostname}" to be non-loopback`).toBe(false);
    }
  });
});
