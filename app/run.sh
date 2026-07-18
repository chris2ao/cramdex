#!/usr/bin/env bash
# Launch cramdex on http://127.0.0.1:8553
set -euo pipefail
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ ! -x "$APP_DIR/server/.venv/bin/uvicorn" ]]; then
  echo "Creating Python venv..."
  (cd "$APP_DIR/server" && uv venv --python 3.12 .venv \
    && uv pip install -r requirements.txt --python .venv/bin/python) \
    || { rm -rf "$APP_DIR/server/.venv"; exit 1; }
fi

if [[ ! -f "$APP_DIR/web/dist/index.html" ]]; then
  echo "Building frontend..."
  (cd "$APP_DIR/web" && npm install && npm run build) \
    || { rm -rf "$APP_DIR/web/dist"; exit 1; }
fi

( sleep 1.5 && open "http://127.0.0.1:8553" ) &
exec "$APP_DIR/server/.venv/bin/uvicorn" main:app \
  --app-dir "$APP_DIR/server" --host 127.0.0.1 --port 8553
