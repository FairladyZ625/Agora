import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      exclude: ["tests/**", "src/types.ts", "dist/**", "vitest.config.ts"],
      thresholds: {
        statements: 40,
        branches: 60,
        functions: 28,
        lines: 40,
      },
    },
  },
});
