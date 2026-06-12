export const createGracefulShutdownRuntime = (dependencies) => {
  const {
    process,
    shutdownTimeoutMs,
    getExitOnShutdown,
    getIsShuttingDown,
    setIsShuttingDown,
    syncToHmrState,
    axCodeWatcherRuntime,
    sessionRuntime,
    scheduledTasksRuntime,
    getHealthCheckInterval,
    clearHealthCheckInterval,
    getTerminalRuntime,
    setTerminalRuntime,
    getMessageStreamRuntime,
    setMessageStreamRuntime,
    shouldSkipAxCodeStop,
    getAxCodePort,
    getAxCodeProcess,
    setAxCodeProcess,
    killProcessOnPort,
    waitForPortRelease,
    getServer,
    getUiAuthController,
    setUiAuthController,
  } = dependencies;

  const gracefulShutdown = async (options = {}) => {
    if (getIsShuttingDown()) return;

    setIsShuttingDown(true);
    syncToHmrState();
    console.log('Starting graceful shutdown...');
    const exitProcess = typeof options.exitProcess === 'boolean' ? options.exitProcess : getExitOnShutdown();

    axCodeWatcherRuntime.stop();
    sessionRuntime.dispose();
    scheduledTasksRuntime?.stop?.();

    const healthCheckInterval = getHealthCheckInterval();
    if (healthCheckInterval) {
      clearHealthCheckInterval(healthCheckInterval);
    }

    const terminalRuntime = getTerminalRuntime();
    if (terminalRuntime) {
      try {
        await terminalRuntime.shutdown();
      } catch {
      } finally {
        setTerminalRuntime(null);
      }
    }

    const messageStreamRuntime = getMessageStreamRuntime();
    if (messageStreamRuntime) {
      try {
        await messageStreamRuntime.close();
      } catch {
      } finally {
        setMessageStreamRuntime(null);
      }
    }

    if (!shouldSkipAxCodeStop()) {
      const portToKill = getAxCodePort();
      const axCodeProcess = getAxCodeProcess();

      if (axCodeProcess) {
        console.log('Stopping ax-code process...');
        let closeTimedOut = false;
        let closeTimeout = null;
        try {
          await Promise.race([
            axCodeProcess.close(),
            new Promise((resolve) => {
              closeTimeout = setTimeout(() => {
                closeTimedOut = true;
                resolve();
              }, Math.max(1000, shutdownTimeoutMs - 1000));
            }),
          ]);
        } catch (error) {
          console.warn('Error closing ax-code process:', error);
        } finally {
          if (closeTimeout) {
            clearTimeout(closeTimeout);
          }
        }
        if (closeTimedOut) {
          console.warn('Timed out closing ax-code process; forcing port cleanup');
        }
        setAxCodeProcess(null);
      }

      killProcessOnPort(portToKill);
      if (!(await waitForPortRelease(portToKill, 5000))) {
        console.warn(`Timed out waiting for ax-code port ${portToKill} to be released during shutdown`);
      }
    } else {
      console.log('Skipping ax-code shutdown (external server)');
    }

    const server = getServer();
    if (server) {
      let closeTimeout = null;
      try {
        await Promise.race([
          new Promise((resolve) => {
            server.close(() => {
              console.log('HTTP server closed');
              resolve();
            });
          }),
          new Promise((resolve) => {
            closeTimeout = setTimeout(() => {
              console.warn('Server close timeout reached, forcing shutdown');
              resolve();
            }, shutdownTimeoutMs);
          }),
        ]);
      } finally {
        if (closeTimeout) {
          clearTimeout(closeTimeout);
        }
      }
    }

    const uiAuthController = getUiAuthController();
    if (uiAuthController) {
      uiAuthController.dispose();
      setUiAuthController(null);
    }

    console.log('Graceful shutdown complete');
    if (exitProcess) {
      process.exit(0);
    }
  };

  return {
    gracefulShutdown,
  };
};
