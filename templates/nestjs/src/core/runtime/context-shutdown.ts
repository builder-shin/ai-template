export function drainBeforeClose(
  app: { close(signal?: string): Promise<void> },
  drain: () => Promise<void>,
): void {
  const close = app.close.bind(app);
  let closing: Promise<void> | undefined;
  const shutdown = () => {
    void app.close().catch(() => {
      process.exitCode = 1;
    });
  };
  app.close = (signal) =>
    (closing ??= (async () => {
      try {
        try {
          await drain();
        } finally {
          await close(signal);
        }
      } finally {
        process.off("SIGINT", shutdown);
        process.off("SIGTERM", shutdown);
      }
    })());
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
