import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("GEDCOM live DB e2e gate", () => {
  it("keeps the live round-trip suite opt-in so default vitest does not connect to Postgres", () => {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(path.join(dir, "gedcom-roundtrip.live.e2e.spec.ts"), "utf8");
    expect(source).toContain("RUN_LIVE_GEDCOM_E2E");
    expect(source).toContain("describe.skipIf");
  });
});
