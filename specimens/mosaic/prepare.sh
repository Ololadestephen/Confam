#!/bin/sh
# Prepares the Mosaic real-world case from the owner's local Mosaic repository.
# Read-only on that repository: it exports a commit and reuses its installed dependencies.
# Nothing generated here is committed to Confam (see .gitignore).
set -eu
MOSAIC="${MOSAIC_REPO:-$HOME/Desktop/Mosaic}"
FIX=585a8a632a2509775f316aeb81f1ac33f6d66c7a
here=$(cd "$(dirname "$0")" && pwd)

if ! git -C "$MOSAIC" diff --quiet "$FIX^" HEAD -- package-lock.json; then
  echo "Mosaic's installed dependencies differ from the pre-fix commit; install them separately." >&2
  exit 1
fi

rm -rf "$here/source" "$here/generated"
mkdir -p "$here/source" "$here/generated"
git -C "$MOSAIC" archive "$FIX^" | tar -x -C "$here/source"
cp "$here/confam-runtime.mjs" "$here/source/confam-runtime.mjs"
printf '{"nodeModules":"%s"}\n' "$MOSAIC/node_modules" > "$here/source/.confam-deps.json"
git -C "$MOSAIC" diff "$FIX^" "$FIX" -- src/server/auth/accounts.ts > "$here/generated/real-fix.patch"
echo "Prepared Mosaic at $(git -C "$MOSAIC" rev-parse --short "$FIX^") (pre-fix) with the real fix as generated/real-fix.patch"
