#!/bin/sh
# Prepares the Bluemax real-world case from the owner's local Bluemax repository.
# Read-only on that repository: it exports the commit before the real fix and the fix itself.
# Never links or pushes to the live Supabase project; everything runs on a local Supabase in Docker.
# Nothing generated here is committed to Confam (see .gitignore).
set -eu
BLUEMAX="${BLUEMAX_REPO:-$HOME/Downloads/bluemaxng}"
here=$(cd "$(dirname "$0")" && pwd)
fix=3ee44d21a260b2d9dd7a8c7793802bd43c8120ca
mkdir -p "$here/generated"
rm -rf "$here/source"
mkdir -p "$here/source"
git -C "$BLUEMAX" archive "$fix^" -- supabase | tar -x -C "$here/source"
cp "$here/confam-runtime.mjs" "$here/source/confam-runtime.mjs"
# The real fix edits the edge function and creates a migration. Confam fixes may only edit configured
# files, so the pre-fix copy gets that migration as an empty file (an empty migration changes nothing)
# and the fix fills it in. Generated types are not needed to run the function.
mig=supabase/migrations/20260308142831_65d31d7b-ad39-46f0-8eb7-410310a3da9f.sql
: > "$here/source/$mig"
tmp=$(mktemp -d)
git -C "$BLUEMAX" archive "$fix^" -- supabase | tar -x -C "$tmp"
: > "$tmp/$mig"
git -C "$tmp" init -q
git -C "$tmp" add -A
git -C "$tmp" -c user.name=confam -c user.email=confam@example.test -c commit.gpgsign=false commit -qm pre-fix
git -C "$BLUEMAX" show "$fix:supabase/functions/submit-lead/index.ts" > "$tmp/supabase/functions/submit-lead/index.ts"
git -C "$BLUEMAX" show "$fix:$mig" > "$tmp/$mig"
git -C "$tmp" diff > "$here/generated/real-fix.patch"
rm -rf "$tmp"
echo "Prepared source at $(git -C "$BLUEMAX" rev-parse --short "$fix^") (pre-fix) with generated/real-fix.patch"

# The latest code (the site as it stands), for reviewing gaps the fixed version may still have.
latest=5e574fe
rm -rf "$here/source-latest"
mkdir -p "$here/source-latest"
git -C "$BLUEMAX" archive "$latest" -- supabase | tar -x -C "$here/source-latest"
cp "$here/confam-runtime.mjs" "$here/source-latest/confam-runtime.mjs"
echo "Prepared source-latest at $(git -C "$BLUEMAX" rev-parse --short "$latest")"
