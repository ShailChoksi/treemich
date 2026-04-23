/**
 * Bulk forward-geocode Place rows that have no latitude/longitude yet.
 *
 * Respects Nominatim usage policy with ~1.1s delay between requests.
 *
 * From repo root (DATABASE_URL in `.env`):
 *   npm run geocode:missing-places --workspace @treemich/api
 *   npm run geocode:missing-places --workspace @treemich/api -- --dry-run --limit 20
 */

import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { geocodePlaceQuery } from "../src/places/nominatimGeocode.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "../../../.env") });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const buildQuery = (row: {
  name: string;
  locality: string | null;
  adminArea: string | null;
  countryCode: string | null;
}): string => {
  const parts = [row.locality, row.adminArea, row.countryCode, row.name].filter((p): p is string =>
    Boolean(p?.trim())
  );
  return [...new Set(parts.map((p) => p.trim()))].join(", ");
};

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const limitArg = argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Math.max(1, Number(limitArg.split("=")[1]) || 50) : 50;

  const prisma = new PrismaClient();
  try {
    const rows = await prisma.place.findMany({
      where: {
        latitude: null,
        longitude: null
      },
      take: limit,
      orderBy: { updatedAt: "asc" }
    });

    if (rows.length === 0) {
      console.log("No places missing coordinates (within limit).");
      return;
    }

    console.log(`${dryRun ? "[dry-run] " : ""}Processing up to ${rows.length} place(s)…`);

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i]!;
      const q = buildQuery(row);
      if (!q.trim()) {
        continue;
      }
      const coords = await geocodePlaceQuery(q);
      if (!coords) {
        console.log(`— skip (no result): ${row.id} "${q}"`);
      } else if (dryRun) {
        console.log(`· would set ${row.id} → ${coords.latitude}, ${coords.longitude} ("${q}")`);
      } else {
        await prisma.place.update({
          where: { id: row.id },
          data: { latitude: coords.latitude, longitude: coords.longitude }
        });
        console.log(`✓ ${row.id} → ${coords.latitude}, ${coords.longitude}`);
      }
      if (i < rows.length - 1) {
        await sleep(1100);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
