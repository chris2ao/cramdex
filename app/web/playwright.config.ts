import { defineConfig } from "@playwright/test";

// Override with CRAMDEX_E2E_PORT when 8553 is already taken (for example by
// another locally running study app instance).
const port = process.env.CRAMDEX_E2E_PORT ?? "8553";

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: `http://127.0.0.1:${port}` },
  webServer: {
    command: `../server/.venv/bin/uvicorn main:app --app-dir ../server --host 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}/api/health`,
    // In CI (and the local CI mirror, which sets CI=true) always start a
    // fresh server against the freshly built demo corpus: never silently
    // reuse whatever happens to already be listening on this port. Outside
    // CI, reuse a developer's already-running dev server for faster local
    // iteration.
    reuseExistingServer: !process.env.CI,
  },
});
