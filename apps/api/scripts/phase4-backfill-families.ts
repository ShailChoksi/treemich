/**
 * Phase 4: infer `Family` rows from legacy `PARENT_OF` edges that have `familyId` null, then attach edges via
 * `FamilyService.createFamily` (same derivation as the HTTP API).
 *
 * From repo root (`DATABASE_URL` in `.env`):
 *   npm run phase4:backfill-families --workspace @treemich/api
 *   npm run phase4:backfill-families --workspace @treemich/api -- --dry-run
 */

import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { buildServices } from "../src/services.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "../../../.env") });

const prisma = new PrismaClient();
const { familyService } = buildServices();

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

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

async function backfillUser(userId: string) {
  if (dryRun) {
    const edges = await prisma.relationship.findMany({
      where: { userId, type: "PARENT_OF", familyId: null },
      select: { fromPersonId: true, toPersonId: true }
    });
    if (edges.length === 0) {
      return 0;
    }
    const { pairToChildren, loneParentToChildren } = analyzeUntaggedParentEdges(edges, userId);
    let n = 0;
    for (const [pk, children] of pairToChildren) {
      if (children.size === 0) {
        continue;
      }
      const [lo, hi] = pk.split("|");
      if (!lo || !hi) {
        continue;
      }
      const childList = [...children];
      console.log(
        `[dry-run] would create two-parent family user=${userId} parents=${lo},${hi} children=${childList.join(",")}`
      );
      n += 1;
    }
    for (const [parentId, children] of loneParentToChildren) {
      const childList = [...children];
      console.log(
        `[dry-run] would create single-parent family user=${userId} parent=${parentId} children=${childList.join(",")}`
      );
      n += 1;
    }
    console.warn(
      `[user ${userId}] dry-run is a single snapshot; live run processes two-parent groups first in a loop, so counts may differ slightly.`
    );
    return n;
  }

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
        notes: "Backfilled from legacy PARENT_OF edges (phase4-backfill-families)",
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
        notes: "Backfilled from legacy PARENT_OF edges (phase4-backfill-families)",
        children: childList.map((childImmichPersonId) => ({ childImmichPersonId }))
      });
      totalCreated += 1;
    }
  }

  return totalCreated;
}

async function main() {
  const users = await prisma.treemichUser.findMany({ select: { id: true } });
  let grand = 0;
  for (const user of users) {
    const n = await backfillUser(user.id);
    grand += n;
    if (n > 0) {
      console.log(`[user ${user.id}] ${dryRun ? "planned" : "created"} ${n} family record(s).`);
    }
  }
  console.log(
    dryRun
      ? `Dry run complete. Planned ${grand} family record(s).`
      : `Done. Created ${grand} family record(s).`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
