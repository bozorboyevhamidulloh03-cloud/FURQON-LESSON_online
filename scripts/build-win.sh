#!/usr/bin/env bash
# Windows 10/11 (x64) ilovasi: o'rnatuvchi (.exe) va ko'chma (.zip). Ishlatish: scripts/build-win.sh [updateUrl]
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f dist/index.html ] || bash scripts/build.sh
rm -rf desktop/web && mkdir -p desktop/web && cp -r dist/. desktop/web/
[ -n "${1:-}" ] && echo "{ \"updateUrl\": \"$1\" }" > desktop/config.json
cd desktop && [ -d node_modules ] || npm install --no-audit --no-fund
npx electron-builder --win ${WIN_TARGETS:-zip} --x64
ls -la dist-win | grep -E "\.(exe|zip)$" || true
