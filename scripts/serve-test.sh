#!/usr/bin/env bash
# dist/ ni vaqtincha serverda ochib, berilgan buyruqni ishga tushiradi
cd "$(dirname "$0")/.."; python3 -m http.server 8765 -d dist >/dev/null 2>&1 & S=$!; sleep 1
timeout 110 "$@"; R=$?; kill $S 2>/dev/null; exit $R
