/**
 * Server entrypoint.
 *
 * Exports createApp() for testing. When run directly (node / tsx), starts the
 * server. Tests import { createApp } and use supertest without spawning a
 * child process.
 *
 * Detection strategy:
 *  - The root server.ts shim sets START_SERVER=1 BEFORE importing this module.
 *    When this module sees START_SERVER=1, it starts listening.
 *  - When vitest imports this module directly (in-process testing), START_SERVER
 *    is not set, so the server does not listen — tests use createApp() + supertest.
 *  - When the test helper spawns this module as a child process (end-to-end
 *    testing), the helper sets START_SERVER=1 explicitly.
 */
import { createApp } from "./app.js";
import { initDb } from "./db/init.js";
import { env } from "./config.js";
import { logger } from "./utils/logger.js";

export { createApp };

const shouldStart = process.env.START_SERVER === "1";

if (shouldStart) {
  (async () => {
    await initDb();
    const app = await createApp();
    const PORT = env.PORT;
    app.listen(PORT, "0.0.0.0", () => {
      logger.info({ msg: "Server running", url: `http://localhost:${PORT}`, env: env.NODE_ENV });
    });
  })().catch((err) => {
    logger.error({ msg: "Fatal startup error", error: err });
    process.exit(1);
  });
}
