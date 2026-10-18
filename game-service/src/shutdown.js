export function withTimeout(promise, timeoutMs, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);

    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function closeHttpServer(server, { timeoutMs = 10_000 } = {}) {
  return new Promise((resolve, reject) => {
    let forceTimer;
    let hardTimer;

    function cleanup() {
      if (forceTimer) clearTimeout(forceTimer);
      if (hardTimer) clearTimeout(hardTimer);
    }

    forceTimer = setTimeout(() => {
      if (typeof server.closeAllConnections === 'function') {
        server.closeAllConnections();
      }
    }, timeoutMs);

    hardTimer = setTimeout(() => {
      cleanup();
      reject(new Error(`HTTP server did not close within ${timeoutMs + 1000}ms.`));
    }, timeoutMs + 1000);

    server.close((error) => {
      cleanup();
      if (error) reject(error);
      else resolve();
    });
  });
}

export function closeDatabasePool(pool, { timeoutMs = 10_000 } = {}) {
  return withTimeout(
    pool.end(),
    timeoutMs,
    `Database pool did not close within ${timeoutMs}ms.`,
  );
}

export function createGracefulShutdown({
  server,
  pool,
  timeoutMs = 10_000,
  logger = console,
  exit = process.exit,
}) {
  let isShuttingDown = false;

  return async function shutdown(signal = 'SIGTERM') {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.log?.(`MediEval game service shutting down after ${signal}.`);

    try {
      await closeHttpServer(server, { timeoutMs });
      await closeDatabasePool(pool, { timeoutMs });
      exit(0);
    } catch (error) {
      logger.error?.(error);
      exit(1);
    }
  };
}
