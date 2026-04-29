import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    setupFiles: ["./src/vitest.setup.ts"],
    include: ["src/**/*.spec.ts", "src/**/*.spec.tsx"],
    exclude: ["src/e2e/**", "node_modules/**"]
  }
});
