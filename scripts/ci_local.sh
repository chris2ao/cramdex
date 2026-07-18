#!/usr/bin/env bash
#
# ci_local.sh: local mirror of .github/workflows/ci.yml, step for step.
#
# This script is the real executable proof that the suite is green: it
# runs every step of both ci.yml jobs (backend, web, and the e2e leg)
# against this checkout and exits non-zero on the first failure, same as a
# failed GitHub Actions job would. Run it before pushing.
#
# Deliberate divergences from ci.yml, each called out again at the step it
# replaces:
#   - No actions/checkout: this script already runs inside the checkout.
#   - No astral-sh/setup-uv / actions/setup-node: uv and Node are already on
#     PATH via Homebrew on this machine (see macOS platform rules), so the
#     actions that install them in CI are unneeded here.
#   - No apt-get poppler-utils: poppler is already installed via Homebrew.
#   - The e2e leg does not rebuild the backend venv the way ci.yml's web
#     job does. ci.yml's web job is an isolated runner with no access to
#     the backend job's already-built venv, so it must build its own; this
#     script already built app/server/.venv in the "[backend]" section
#     above, moments earlier in the same run against this same checkout,
#     so the e2e leg just reuses it.
#   - $RUNNER_TEMP does not exist locally; mktemp stands in for it.
#   - Port 8553 (ci.yml's CRAMDEX_E2E_PORT, free on the GitHub runner) is
#     already used by another app on this developer's machine, so this
#     script uses 8557 instead and never touches 8553 or the real
#     ~/.cramdex.
#
# Usage: bash scripts/ci_local.sh
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# playwright.config.ts: reuseExistingServer: !process.env.CI. Exporting
# CI=true here is what makes this local mirror behave like ci.yml (always
# start a fresh uvicorn against the freshly built demo corpus) instead of
# the developer-friendly default of reusing whatever's already listening on
# the port.
export CI=true

# Diverges from ci.yml's "${{ runner.temp }}/cramdex-home" (web job env,
# used by the "Build demo pack" / "Build corpus" / "Run Playwright e2e"
# steps): no RUNNER_TEMP locally, so mktemp stands in. Same purpose: a
# throwaway CRAMDEX_HOME so the real ~/.cramdex is never read or written.
CRAMDEX_HOME_DIR="$(mktemp -d "${TMPDIR:-/tmp}/cramdex-home.XXXXXX")"
export CRAMDEX_HOME="$CRAMDEX_HOME_DIR"

# Diverges from ci.yml's CRAMDEX_E2E_PORT=8553 (free on the GitHub-hosted
# runner): this developer's machine already runs another app on 8553, so
# the local mirror uses 8557 instead. See app/web/playwright.config.ts and
# app/web/vite.config.ts for the 8553 default this overrides.
export CRAMDEX_E2E_PORT=8557
export CRAMDEX_E2E_QUERY="Regolith Sweep"

PLAYWRIGHT_LOG="$(mktemp "${TMPDIR:-/tmp}/cramdex-playwright-output.XXXXXX")"

cleanup() {
  local status=$?
  # Kill only processes bound to CRAMDEX_E2E_PORT (8557): that port is used
  # exclusively by this script's own e2e run, so scoping the kill to it can
  # never touch the developer's real app on 8553 or any unrelated process.
  # Playwright normally stops its own webServer when the test run ends
  # (reuseExistingServer is false here, per CI=true above); this is a
  # safety net for abnormal termination (Ctrl-C, a crashed earlier step)
  # that could otherwise leak a uvicorn process on 8557.
  local pids
  pids="$(lsof -ti tcp:"$CRAMDEX_E2E_PORT" 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    # shellcheck disable=SC2086 # pids can hold multiple lsof -t results
    # (one PID per line); word splitting here is required to pass each PID
    # as a separate kill argument, matching lsof's own documented idiom.
    kill $pids 2>/dev/null || true
  fi
  rm -rf "$CRAMDEX_HOME_DIR" "$PLAYWRIGHT_LOG"
  exit "$status"
}
trap cleanup EXIT INT TERM

echo "== ci_local: CRAMDEX_HOME=$CRAMDEX_HOME_DIR  port=$CRAMDEX_E2E_PORT =="

# --- backend job -------------------------------------------------------
# ci.yml backend job: checkout (n/a, already checked out), astral-sh/setup-
# uv@v4 (n/a, uv already on PATH), apt-get poppler-utils (n/a, poppler
# already on PATH via Homebrew), create venv + install requirements, run
# pytest.
echo ""
echo "== [backend] create venv and install requirements =="
(
  cd app/server
  uv venv --clear --python 3.12 .venv
  uv pip install -r requirements.txt --python .venv/bin/python
)

echo ""
echo "== [backend] pytest =="
(cd app/server && .venv/bin/python -m pytest tests/ -q)

# --- web job -------------------------------------------------------------
# ci.yml web job: checkout (n/a), actions/setup-node@v4 node 20 with npm
# cache (n/a, Node already on PATH via Homebrew; npm's own local cache is
# used as-is), npm ci, lint, vitest, build.
echo ""
echo "== [web] npm ci =="
(cd app/web && npm ci)

echo ""
echo "== [web] lint =="
(cd app/web && npm run lint)

echo ""
echo "== [web] vitest =="
(cd app/web && npm test -- --run)

echo ""
echo "== [web] build =="
(cd app/web && npm run build)

# --- web job: e2e leg ------------------------------------------------------
# ci.yml e2e leg: astral-sh/setup-uv@v4 + apt-get poppler-utils (n/a, same
# reasoning as the backend job above: both already on PATH via Homebrew).
# ci.yml also rebuilds the backend venv here, because its web job is an
# isolated runner that never sees the backend job's venv; this script
# skips that rebuild because the "[backend]" section above already built
# app/server/.venv against this same checkout, moments ago. Then: build
# the demo pack into CRAMDEX_HOME, run scripts/build.sh, install
# Playwright's Chromium, run Playwright with --reporter=line, then guard
# against a skip-only run.
echo ""
echo "== [e2e] build demo pack =="
app/server/.venv/bin/python scripts/make_demo_pack.py

echo ""
echo "== [e2e] build corpus =="
bash scripts/build.sh

echo ""
echo "== [e2e] install Playwright chromium =="
(cd app/web && npx playwright install --with-deps chromium)

echo ""
echo "== [e2e] run Playwright (guarded against a skip-only run) =="
set +e
(cd app/web && npx playwright test --reporter=line) | tee "$PLAYWRIGHT_LOG"
PLAYWRIGHT_STATUS="${PIPESTATUS[0]}"
set -e
if [[ "$PLAYWRIGHT_STATUS" -ne 0 ]]; then
  echo "ERROR: playwright test exited non-zero ($PLAYWRIGHT_STATUS)" >&2
  exit "$PLAYWRIGHT_STATUS"
fi
# A skip-only run (e.g. CRAMDEX_HOME pointing at a pack with no built
# corpus) still exits 0 from Playwright's own point of view: every test
# calls test.skip() rather than failing. Without this guard the script
# would report success while proving nothing against the demo pack.
if ! grep -q "5 passed" "$PLAYWRIGHT_LOG"; then
  echo "ERROR: e2e guard failed: expected '5 passed' in Playwright output (skip-only run?)" >&2
  exit 1
fi

echo ""
echo "== ci_local: all steps passed =="
