import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Nested deps (e.g. @use-gesture/react, react-use-measure) can pull React 18; two copies break hooks / R3F.
  resolve: {
    dedupe: ["react", "react-dom", "scheduler"]
  },
  optimizeDeps: {
    include: ["react", "react-dom", "scheduler", "@react-three/fiber", "@react-three/drei"]
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, "")
      }
    }
  }
});
