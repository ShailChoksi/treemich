import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./db/client.js";

const app = buildApp();

const shutdown = async (signal: NodeJS.Signals) => {
  app.log.info({ signal }, "Shutting down Treemich API");
  try {
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
    await prisma.$disconnect();
    process.exit(1);
  }
};

void start();
