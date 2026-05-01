import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config.js";

/** Runs only the opt-in live Postgres GEDCOM round-trip suite (`RUN_LIVE_GEDCOM_E2E=1`). */
export default mergeConfig(
  base,
  defineConfig({
    test: {
      env: {
        RUN_LIVE_GEDCOM_E2E: "1"
      },
      include: ["test/gedcom-roundtrip.live.e2e.spec.ts"]
    }
  })
);
