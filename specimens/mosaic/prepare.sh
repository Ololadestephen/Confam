#!/bin/sh
# Prepares the Mosaic real-world case from the owner's local Mosaic repository.
# Read-only on that repository: it exports a commit and reuses its installed dependencies.
# Nothing generated here is committed to Confam (see .gitignore).
set -eu
MOSAIC="${MOSAIC_REPO:-$HOME/Desktop/Mosaic}"
here=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$here/generated"

# export <fix commit> <source folder> <patch name> <fixed file>
export_case() {
  fix=$1; folder=$2; patch=$3; file=$4
  if ! git -C "$MOSAIC" diff --quiet "$fix^" HEAD -- package-lock.json; then
    echo "Mosaic's installed dependencies differ from $fix^; install them separately." >&2
    exit 1
  fi
  rm -rf "$here/$folder"
  mkdir -p "$here/$folder"
  git -C "$MOSAIC" archive "$fix^" | tar -x -C "$here/$folder"
  cp "$here/confam-runtime.mjs" "$here/$folder/confam-runtime.mjs"
  printf '{"nodeModules":"%s"}\n' "$MOSAIC/node_modules" > "$here/$folder/.confam-deps.json"
  git -C "$MOSAIC" diff "$fix^" "$fix" -- "$file" > "$here/generated/$patch"
  echo "Prepared $folder at $(git -C "$MOSAIC" rev-parse --short "$fix^") (pre-fix) with generated/$patch"
}

# Sign-in lockout: successful sign-ins counted toward the lockout.
export_case 585a8a632a2509775f316aeb81f1ac33f6d66c7a source real-fix.patch src/server/auth/accounts.ts
# Workspace re-select: choosing the open workspace left the page stuck loading.
export_case 5a72a3c10059f15730b07769136ef1da43264272 source-workspace workspace-fix.patch src/components/workspace-app.tsx

# The latest code (the app as it stands), for reviewing gaps the fixed version may still have.
latest=$(git -C "$MOSAIC" rev-parse --short HEAD)
if ! git -C "$MOSAIC" diff --quiet 585a8a632a2509775f316aeb81f1ac33f6d66c7a^ HEAD -- package-lock.json; then
  echo "Mosaic's installed dependencies differ from the latest code; install them separately." >&2
  exit 1
fi
rm -rf "$here/source-latest"
mkdir -p "$here/source-latest"
git -C "$MOSAIC" archive HEAD | tar -x -C "$here/source-latest"
cp "$here/confam-runtime.mjs" "$here/source-latest/confam-runtime.mjs"
printf '{"nodeModules":"%s"}\n' "$MOSAIC/node_modules" > "$here/source-latest/.confam-deps.json"
echo "Prepared source-latest at $latest"
