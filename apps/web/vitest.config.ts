import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "happy-dom",
      setupFiles: ["./src/vitest.setup.ts"],
      include: ["src/**/*.spec.ts", "src/**/*.spec.tsx"],
      exclude: ["src/e2e/**", "node_modules/**"]
    }
  })
);
