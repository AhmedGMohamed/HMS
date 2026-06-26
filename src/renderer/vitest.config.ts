import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/renderer/test/**/*.spec.ts", "src/renderer/test/**/*.spec.tsx"],
    exclude: ["node_modules", "build", "dist"],
  },
});
