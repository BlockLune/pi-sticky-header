import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "sticky-header.ts"],
      reporter: ["text", "html", "lcov"],
      thresholds: { statements: 90, branches: 85, functions: 80, lines: 95 },
    },
  },
});
