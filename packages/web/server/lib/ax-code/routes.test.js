import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { registerAxCodeRoutes } from './routes.js';

const createApp = (overrides = {}) => {
  const app = express();
  app.use(express.json());

  const dependencies = {
    crypto: globalThis.crypto,
    clientReloadDelayMs: 25,
    getAxCodeResolutionSnapshot: vi.fn(() => ({})),
    formatSettingsResponse: vi.fn((settings) => settings),
    readSettingsFromDisk: vi.fn(async () => ({})),
    readSettingsFromDiskMigrated: vi.fn(async () => ({})),
    persistSettings: vi.fn(async (settings) => settings),
    sanitizeProjects: vi.fn((projects) => projects),
    validateDirectoryPath: vi.fn(() => ({ valid: true })),
    resolveProjectDirectory: vi.fn(async () => ({ directory: '/tmp/project', error: null })),
    getProviderSources: vi.fn(() => ({ sources: {} })),
    removeProviderConfig: vi.fn(() => true),
    refreshAxCodeAfterConfigChange: vi.fn(async () => undefined),
    backgroundAxCodeReloader: {
      start: vi.fn(() => ({
        alreadyRunning: false,
        reloadDelayMs: 1500,
        reloadTimeoutMs: 360000,
      })),
    },
    buildAxCodeUrl: vi.fn((path) => `http://127.0.0.1:4096${path}`),
    getAxCodeAuthHeaders: vi.fn(() => ({})),
    ...overrides,
  };

  registerAxCodeRoutes(app, dependencies);
  return { app, dependencies };
};

describe('ax-code routes', () => {
  it('queues provider disconnect reload without awaiting the AX Code restart', async () => {
    const { app, dependencies } = createApp();

    const response = await request(app)
      .delete('/api/provider/test-provider/auth?scope=user')
      .expect(200);

    expect(dependencies.removeProviderConfig).toHaveBeenCalledWith('test-provider', '/tmp/project', 'user');
    expect(dependencies.backgroundAxCodeReloader.start).toHaveBeenCalledWith('provider test-provider disconnected (user)');
    expect(dependencies.refreshAxCodeAfterConfigChange).not.toHaveBeenCalled();
    expect(response.body).toMatchObject({
      success: true,
      removed: true,
      requiresReload: true,
      reloadInProgress: false,
      message: 'Provider disconnected. AX Code is restarting…',
      reloadDelayMs: 1500,
      reloadTimeoutMs: 360000,
    });
  });

  it('does not queue a provider reload when nothing was removed', async () => {
    const { app, dependencies } = createApp({
      removeProviderConfig: vi.fn(() => false),
    });

    const response = await request(app)
      .delete('/api/provider/test-provider/auth?scope=user')
      .expect(200);

    expect(dependencies.backgroundAxCodeReloader.start).not.toHaveBeenCalled();
    expect(response.body).toMatchObject({
      success: true,
      removed: false,
      requiresReload: false,
      message: 'Provider was not connected',
    });
  });
});
