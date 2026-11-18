#!/usr/bin/env bash
# Ishlatish: scripts/build.sh   (esbuild va tsc kerak)
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$PWD/node_modules/.bin:$PATH"
ESB=${ESBUILD:-esbuild}; rm -rf dist; mkdir -p dist
tsc --noEmit --strict --target es2022 --lib es2022,dom,dom.iterable --moduleResolution bundler --module esnext --skipLibCheck app/src/main.ts packages/fur-format/src/index.ts
$ESB app/src/main.ts --bundle --minify --target=es2022 --format=iife --outfile=dist/app.js --log-level=warning
cp app/public/* app/src/style.css dist/
mkdir -p dist/vendor; P=${PDFJS:-$( [ -d node_modules/pdfjs-dist/build ] && echo node_modules/pdfjs-dist/build || echo /opt/npm-tools/node_modules/pdfjs-dist/build )}; cp $P/pdf.min.mjs $P/pdf.worker.min.mjs dist/vendor/
printf '{"web":%s}\n' "${WEB_VERSION:-1}" > dist/version.json
echo "build OK -> dist/ (web ${WEB_VERSION:-1})"
