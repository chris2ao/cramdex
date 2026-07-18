import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: { "/api": "http://127.0.0.1:8553" },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    globals: true,
    exclude: [...configDefaults.exclude, "./e2e/**"],
    // Vitest's own per-test ceiling defaults to 5000ms, same as the
    // testing-library asyncUtilTimeout raised in setup.ts; a test with
    // several sequential await findBy*/userEvent calls can exceed the
    // *test*-level timeout under worker CPU contention even when no single
    // query would individually time out (observed: "Test timed out in
    // 5000ms" replacing the specific TestingLibraryElementError). Raising
    // this well above asyncUtilTimeout gives the whole test body headroom
    // while any single stuck query still fails within its own 5000ms.
    testTimeout: 15_000,
  },
});
