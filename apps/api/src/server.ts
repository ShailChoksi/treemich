/**
 * @packageDocumentation
 * Treemich API process entry: builds Fastify app, listens on `PORT`, runs session cleanup and optional co-occurrence refresh timers.
 */

import { buildApp } from "./app.js";
import { CooccurrenceConflictError } from "./cooccurrence/service.js";
import { env, isAutoPhase4FamilyBackfillEnabled } from "./config/env.js";
import { prisma } from "./db/client.js";
import { maybeRunAutomaticPhase4FamilyBackfillOnBoot } from "./families/phase4BackfillFromParentEdges.js";

const app = buildApp();
const sessionCleanupIntervalMs = 60 * 60_000;
const cooccurrenceRefreshIntervalMs = 5 * 60_000;
let sessionCleanupTimer: NodeJS.Timeout | null = null;
let cooccurrenceRefreshTimer: NodeJS.Timeout | null = null;
let cooccurrenceRefreshInFlight = false;

const cleanupExpiredSessions = async () => {
  const deletedCount = await app.services.authService.cleanupExpiredSessions();
  if (deletedCount > 0) {
    app.log.info({ deletedCount }, "Cleaned up expired sessions");
  }
};

const refreshScheduledCooccurrence = async () => {
  if (cooccurrenceRefreshInFlight) {
    return;
  }

  cooccurrenceRefreshInFlight = true;
  try {
    const dueSchedules = await app.services.cooccurrenceService.getDueSchedules();

    for (const schedule of dueSchedules) {
      if (!schedule.user.linkedAccount) {
        app.log.warn({ userId: schedule.userId }, "Skipping co-occurrence refresh without linked account");
        continue;
      }

      try {
        await app.services.cooccurrenceService.triggerComputation(
          schedule.userId,
          app.services.immichClientFactory.getClient(schedule.user.linkedAccount)
        );
      } catch (error) {
        if (error instanceof CooccurrenceConflictError) {
          app.log.info({ userId: schedule.userId }, "Skipped overlapping co-occurrence refresh");
          continue;
        }

        app.log.error(
          { error, userId: schedule.userId },
          "Failed to trigger scheduled co-occurrence refresh"
        );
      }
    }
  } finally {
    cooccurrenceRefreshInFlight = false;
  }
};

const shutdown = async (signal: NodeJS.Signals) => {
  app.log.info({ signal }, "Shutting down Treemich API");
  try {
    if (sessionCleanupTimer) {
      clearInterval(sessionCleanupTimer);
      sessionCleanupTimer = null;
    }
    if (cooccurrenceRefreshTimer) {
      clearInterval(cooccurrenceRefreshTimer);
      cooccurrenceRefreshTimer = null;
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
    await maybeRunAutomaticPhase4FamilyBackfillOnBoot({
      prisma,
      familyService: app.services.familyService,
      log: app.log,
      enabled: isAutoPhase4FamilyBackfillEnabled()
    });
    await cleanupExpiredSessions();
    await refreshScheduledCooccurrence();
    sessionCleanupTimer = setInterval(() => {
      void cleanupExpiredSessions().catch((error) => {
        app.log.error(error, "Failed to clean up expired sessions");
      });
    }, sessionCleanupIntervalMs);
    sessionCleanupTimer.unref();
    cooccurrenceRefreshTimer = setInterval(() => {
      void refreshScheduledCooccurrence().catch((error) => {
        app.log.error(error, "Failed to refresh scheduled co-occurrence jobs");
      });
    }, cooccurrenceRefreshIntervalMs);
    cooccurrenceRefreshTimer.unref();

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
    if (cooccurrenceRefreshTimer) {
      clearInterval(cooccurrenceRefreshTimer);
      cooccurrenceRefreshTimer = null;
    }
    app.services.immichClientFactory.dispose();
    await prisma.$disconnect();
    process.exit(1);
  }
};

void start();
