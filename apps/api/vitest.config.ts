import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts", "test/**/*.spec.ts"],
    /** Cold `import()` of large route graphs can exceed defaults on slow disks (e.g. WSL + `/mnt`). */
    testTimeout: 30_000,
    hookTimeout: 30_000,
    /** Vitest 4: replaces `poolOptions.threads` (removed). Default pool is `forks`; keep thread pool + worker cap. */
    pool: "threads",
    maxWorkers: 4,
    setupFiles: ["./test/setup-env.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.spec.ts", "src/server.ts", "src/db/client.ts"],
      thresholds: {
        statements: 55,
        branches: 40,
        functions: 60,
        lines: 55
      }
    }
  }
});
