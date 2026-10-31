#!/bin/sh
set -eu
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
rm -rf "$HERE/source"
mkdir -p "$HERE/source"
cp -R "$HERE/../app/." "$HERE/source/"
(cd "$HERE/source" && patch -p1 --batch < "$HERE/../../../runs/task-board-wonder-fix.patch")
cp "$HERE/harness.cjs" "$HERE/source/harness.cjs"
