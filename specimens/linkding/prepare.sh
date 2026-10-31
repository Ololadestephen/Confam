#!/bin/sh
# Prepares the Linkding case from a local clone of https://github.com/sissbruecker/linkding (MIT).
# Nothing generated here is committed to Confam (see .gitignore).
set -eu
here=$(cd "$(dirname "$0")" && pwd)
upstream="$here/upstream"
fix=2ffc8bbec2d4a9d372b291b871ac34d412067dc0
[ -d "$upstream/.git" ] || git clone https://github.com/sissbruecker/linkding "$upstream"
git -C "$upstream" cat-file -e "$fix" || git -C "$upstream" fetch origin
# Runtime packages are the same before and after the fix; install them once from Linkding's lock file.
if [ ! -x "$here/.venv/bin/python" ]; then
  (cd "$upstream" && UV_PROJECT_ENVIRONMENT="$here/.venv" uv sync --frozen --no-dev --no-install-package uwsgi --no-install-package supervisor)
fi
mkdir -p "$here/generated"

# export <commit> <folder>
export_source() {
  rm -rf "$here/$2"
  mkdir -p "$here/$2"
  git -C "$upstream" archive "$1" -- bookmarks manage.py version.txt | tar -x -C "$here/$2"
  cp "$here/confam-runtime.mjs" "$here/$2/confam-runtime.mjs"
  printf '{"python":"%s"}\n' "$here/.venv/bin/python" > "$here/$2/.confam-deps.json"
}

# SSRF: checking a bookmark URL made the server fetch any address, including internal ones.
export_source "$fix^" source
# The real fix adds a new module; Confam only edits configured files, so the pre-fix copy gets it empty.
: > "$here/source/bookmarks/services/http_client.py"
files="bookmarks/services/assets.py bookmarks/services/favicon_loader.py bookmarks/services/http_client.py
  bookmarks/services/preview_image_loader.py bookmarks/services/website_loader.py bookmarks/settings/base.py bookmarks/views/settings.py"
# Diff against the copy with the empty placeholder, so the patch edits that file instead of creating it.
tmp=$(mktemp -d)
cp -R "$here/source/bookmarks" "$tmp/bookmarks"
git -C "$tmp" -c core.fsmonitor=false init -q
git -C "$tmp" -c core.fsmonitor=false add -A
git -C "$tmp" -c core.fsmonitor=false -c user.name=confam -c user.email=confam@example.test -c commit.gpgsign=false commit -qm pre-fix
for file in $files; do git -C "$upstream" show "$fix:$file" > "$tmp/$file"; done
git -C "$tmp" -c core.fsmonitor=false diff > "$here/generated/real-fix.patch"
rm -rf "$tmp" 2>/dev/null || true  # a background Git process can briefly hold the folder; the system cleans it up
echo "Prepared source at $(git -C "$upstream" rev-parse --short "$fix^") (pre-fix) with generated/real-fix.patch"

# The latest code when the gaps were reviewed (October 31, 2026), pinned so results stay reproducible.
latest=27b7303
export_source "$latest" source-latest
echo "Prepared source-latest at $latest"
