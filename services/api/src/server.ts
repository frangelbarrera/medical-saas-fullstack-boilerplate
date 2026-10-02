/**
 * Server entry: env load, production fail-fast, first-admin bootstrap, listen.
 *
 * SEC-003: in production the app REQUIRES a reachable PostgreSQL database -
 * there is no mock runtime anymore. If the database is down at boot the
 * process exits instead of serving from stale state.
 */
import dotenv from "dotenv";
dotenv.config();

import { loadEnv } from "@medical/data";
import { bootstrap } from "./bootstrap.js";
import { createApp } from "./app.js";
import { logger } from "./lib/logger.js";
import { prisma, checkDatabaseHealth } from "@medical/data";
import { setDraining } from "./lib/readiness.js";

const env = loadEnv();

async function main(): Promise<void> {
  const dbReady = await checkDatabaseHealth();
  if (!dbReady) {
    if (env.NODE_ENV === "production") {
      logger.error({ msg: "Database is not reachable - refusing to start in production (SEC-003)" });
      process.exit(1);
    }
    logger.error({
      msg: "Database is not reachable. Run PostgreSQL and apply migrations first: npm run prisma:deploy",
    });
    process.exit(1);
  }

  await bootstrap();

  const app = await createApp();
  const server = app.listen(env.PORT, () => {
    logger.info({ msg: `Server listening on port ${env.PORT} (${env.NODE_ENV})` });
  });

  const shutdown = async (signal: string) => {
    logger.info({ msg: `${signal} received, draining connections` });
    // Flip readiness first so the load balancer stops routing here, then
    // close the server and give in-flight requests a bounded window.
    setDraining();
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 8000).unref();
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  logger.error({ msg: "Fatal startup error", err: String(err) });
  process.exit(1);
});
