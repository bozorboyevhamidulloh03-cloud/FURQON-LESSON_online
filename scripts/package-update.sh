#!/usr/bin/env bash
# Ishlatish: scripts/package-update.sh <versiya-raqami> <owner/repo> [notes]
# dist/ dan: site/latest.json, site/fur-web-N.zip, site/app/ (brauzer uchun PWA) yaratadi.
set -euo pipefail
cd "$(dirname "$0")/.."
N=${1:?versiya raqami kerak}; REPO=${2:?owner/repo kerak}; NOTES=${3:-"Yangi versiya"}
[ -f dist/index.html ] || { echo "avval scripts/build.sh"; exit 1; }
rm -rf site; mkdir -p site/app
(cd dist && zip -qr -X "../site/fur-web-$N.zip" .)
cp -r dist/. site/app/
SHA=$(sha256sum "site/fur-web-$N.zip" | cut -d' ' -f1); SIZE=$(stat -c %s "site/fur-web-$N.zip")
OWNER=${REPO%%/*}
python3 - "$N" "$SHA" "$SIZE" "$NOTES" "$REPO" "${MIN_APK:-1}" <<'PY'
import json,sys
n,sha,size,notes,repo,minapk=sys.argv[1:7]
json.dump({"web":int(n),"minApk":int(minapk),"zip":f"fur-web-{n}.zip","sha256":sha,"size":int(size),"notes":notes,"apk":f"https://github.com/{repo}/releases/latest"},open("site/latest.json","w"),ensure_ascii=False,indent=1)
PY
echo '<!doctype html><meta charset=utf-8><meta http-equiv=refresh content="0;url=app/"><a href="app/">FUR Platform</a>' > site/index.html
echo "tayyor: site/ (versiya $N, sha256 ${SHA:0:12}…, $SIZE bayt)"
