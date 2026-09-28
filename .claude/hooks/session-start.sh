#!/bin/bash
# Cloud sessions (Claude Code on the web) only: no Edge and no GPU there, so point the
# screenshot / audio tools at the preinstalled Chromium with software WebGL, and install
# dependencies without rewriting package-lock.json. Does nothing on the local Windows PC.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

chrome="$(ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | sort | tail -n 1 || true)"
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  [ -n "$chrome" ] && echo "export SHISHI_BROWSER=\"$chrome\"" >> "$CLAUDE_ENV_FILE"
  echo 'export SHISHI_SWIFTSHADER=1' >> "$CLAUDE_ENV_FILE"
fi

cd "$CLAUDE_PROJECT_DIR"
if [ ! -d node_modules ]; then
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci --no-audit --no-fund
fi
