/**
 * Infer `Family` rows from legacy `PARENT_OF` edges with `familyId` null, then attach derived edges via
 * `FamilyService.createFamily` (same as `POST /families` and the `phase4:backfill-families` script).
 */

import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type { FamilyService } from "./service.js";

export const PHASE4_FAMILY_BACKFILL_CHECKPOINT_ID = "phase4_family_backfill_auto_v1";

export const PHASE4_FAMILY_BACKFILL_NOTES =
  "Backfilled from legacy PARENT_OF edges (phase4-backfill-families)";

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

const ADVISORY_LOCK_KEY = BigInt("9024519473027");

export type Phase4BackfillLogger = {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  warn: (obj: Record<string, unknown>, msg?: string) => void;
  error: (obj: Record<string, unknown>, msg?: string) => void;
};

function analyzeUntaggedParentEdges(edges: { fromPersonId: string; toPersonId: string }[], userId: string) {
  const childToParents = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (!childToParents.has(edge.toPersonId)) {
      childToParents.set(edge.toPersonId, new Set());
    }
    childToParents.get(edge.toPersonId)!.add(edge.fromPersonId);
  }

  const pairToChildren = new Map<string, Set<string>>();
  const ambiguousChildren: string[] = [];
  for (const [childId, parents] of childToParents) {
    if (parents.size === 2) {
      const sorted = [...parents].sort();
      const a = sorted[0];
      const b = sorted[1];
      if (!a || !b) {
        continue;
      }
      const pk = pairKey(a, b);
      if (!pairToChildren.has(pk)) {
        pairToChildren.set(pk, new Set());
      }
      pairToChildren.get(pk)!.add(childId);
    } else if (parents.size > 2) {
      ambiguousChildren.push(childId);
    }
  }

  if (ambiguousChildren.length > 0) {
    console.warn(
      `[user ${userId}] skipping ${ambiguousChildren.length} child(ren) with more than two untagged parents:`,
      ambiguousChildren.slice(0, 8).join(", "),
      ambiguousChildren.length > 8 ? "…" : ""
    );
  }

  const loneParentToChildren = new Map<string, Set<string>>();
  for (const [childId, parents] of childToParents) {
    if (parents.size !== 1) {
      continue;
    }
    const parentId = [...parents][0];
    if (!parentId) {
      continue;
    }
    if (!loneParentToChildren.has(parentId)) {
      loneParentToChildren.set(parentId, new Set());
    }
    loneParentToChildren.get(parentId)!.add(childId);
  }

  return { childToParents, pairToChildren, loneParentToChildren, edgeCount: edges.length };
}

/**
 * Live backfill for one Treemich user. Returns the number of `Family` rows created.
 */
export async function runPhase4FamilyBackfillForUser(
  prisma: PrismaClient,
  familyService: FamilyService,
  userId: string
): Promise<number> {
  let iterations = 0;
  let totalCreated = 0;

  while (iterations < 10_000) {
    iterations += 1;
    const edges = await prisma.relationship.findMany({
      where: { userId, type: "PARENT_OF", familyId: null },
      select: { fromPersonId: true, toPersonId: true }
    });
    if (edges.length === 0) {
      break;
    }

    const { pairToChildren, loneParentToChildren } = analyzeUntaggedParentEdges(edges, userId);

    let createdThisPass = false;

    for (const [pk, children] of pairToChildren) {
      if (children.size === 0) {
        continue;
      }
      const [lo, hi] = pk.split("|");
      if (!lo || !hi) {
        continue;
      }
      const childList = [...children];
      await familyService.createFamily(userId, {
        parent1ImmichPersonId: lo,
        parent2ImmichPersonId: hi,
        notes: PHASE4_FAMILY_BACKFILL_NOTES,
        children: childList.map((childImmichPersonId) => ({ childImmichPersonId }))
      });
      totalCreated += 1;
      createdThisPass = true;
    }

    if (createdThisPass) {
      continue;
    }

    if (loneParentToChildren.size === 0) {
      console.error(
        `[user ${userId}] stopped with ${edges.length} untagged PARENT_OF edges (ambiguous graph — resolve manually).`
      );
      break;
    }

    for (const [parentId, children] of loneParentToChildren) {
      const childList = [...children];
      await familyService.createFamily(userId, {
        parent1ImmichPersonId: parentId,
        parent2ImmichPersonId: null,
        notes: PHASE4_FAMILY_BACKFILL_NOTES,
        children: childList.map((childImmichPersonId) => ({ childImmichPersonId }))
      });
      totalCreated += 1;
    }
  }

  return totalCreated;
}

export async function runPhase4FamilyBackfillForAllUsers(
  prisma: PrismaClient,
  familyService: FamilyService
): Promise<number> {
  const users = await prisma.treemichUser.findMany({ select: { id: true } });
  let grand = 0;
  for (const user of users) {
    const n = await runPhase4FamilyBackfillForUser(prisma, familyService, user.id);
    grand += n;
  }
  return grand;
}

/**
 * Runs the Phase 4 family backfill once per database after upgrade, unless disabled via env or already recorded.
 * Uses a Postgres advisory lock so only one API instance runs it when horizontally scaled.
 */
export async function maybeRunAutomaticPhase4FamilyBackfillOnBoot(input: {
  prisma: PrismaClient;
  familyService: FamilyService;
  log: Phase4BackfillLogger;
  enabled: boolean;
}): Promise<void> {
  const { prisma, familyService, log, enabled } = input;

  if (!enabled) {
    log.info(
      {},
      "Skipping automatic Phase 4 family backfill (TREEMICH_AUTO_PHASE4_FAMILY_BACKFILL disabled)"
    );
    return;
  }

  let locked = false;
  try {
    const lockRows = await prisma.$queryRaw<{ pg_try_advisory_lock: boolean }[]>(
      Prisma.sql`SELECT pg_try_advisory_lock(${ADVISORY_LOCK_KEY}) AS "pg_try_advisory_lock"`
    );
    locked = Boolean(lockRows[0]?.pg_try_advisory_lock);
    if (!locked) {
      log.info(
        {},
        "Another Treemich API instance holds the Phase 4 backfill lock; skipping automatic backfill"
      );
      return;
    }

    const existing = await prisma.dataMigrationCheckpoint.findUnique({
      where: { id: PHASE4_FAMILY_BACKFILL_CHECKPOINT_ID }
    });
    if (existing) {
      log.info({}, "Phase 4 automatic family backfill already completed for this database");
      return;
    }

    const created = await runPhase4FamilyBackfillForAllUsers(prisma, familyService);
    await prisma.dataMigrationCheckpoint.create({
      data: { id: PHASE4_FAMILY_BACKFILL_CHECKPOINT_ID }
    });
    log.info({ createdFamilyRows: created }, "Automatic Phase 4 family backfill finished");
  } catch (error) {
    log.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Automatic Phase 4 family backfill failed (will retry on next boot if checkpoint was not written)"
    );
  } finally {
    if (locked) {
      await prisma.$queryRaw(Prisma.sql`SELECT pg_advisory_unlock(${ADVISORY_LOCK_KEY})`);
    }
  }
}
