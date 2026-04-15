import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./db/client.js";

const app = buildApp();
const sessionCleanupIntervalMs = 60 * 60_000;
let sessionCleanupTimer: NodeJS.Timeout | null = null;

const cleanupExpiredSessions = async () => {
  const deletedCount = await app.services.authService.cleanupExpiredSessions();
  if (deletedCount > 0) {
    app.log.info({ deletedCount }, "Cleaned up expired sessions");
  }
};

const shutdown = async (signal: NodeJS.Signals) => {
  app.log.info({ signal }, "Shutting down Treemich API");
  try {
    if (sessionCleanupTimer) {
      clearInterval(sessionCleanupTimer);
      sessionCleanupTimer = null;
    }

    app.services.immichClientFactory.dispose();
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    app.log.error(error, "Failed to shut down cleanly");
    process.exit(1);
  }
};

const start = async () => {
  try {
    await cleanupExpiredSessions();
    sessionCleanupTimer = setInterval(() => {
      void cleanupExpiredSessions().catch((error) => {
        app.log.error(error, "Failed to clean up expired sessions");
      });
    }, sessionCleanupIntervalMs);
    sessionCleanupTimer.unref();

    await app.listen({ port: env.PORT, host: "::" });
    app.log.info(`Treemich API listening on ${env.PORT}`);
    app.log.info(`Treemich API booted at ${new Date().toISOString()}`);
    process.once("SIGINT", () => {
      void shutdown("SIGINT");
    });
    process.once("SIGTERM", () => {
      void shutdown("SIGTERM");
    });
  } catch (error) {
    app.log.error(error);
    if (sessionCleanupTimer) {
      clearInterval(sessionCleanupTimer);
      sessionCleanupTimer = null;
    }
    app.services.immichClientFactory.dispose();
    await prisma.$disconnect();
    process.exit(1);
  }
};

void start();
