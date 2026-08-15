import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    // Mirror tsconfig's "@/*" -> "src/*" so tests can import modules that use it.
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
});
