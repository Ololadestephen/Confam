#!/bin/sh
set -eu
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
rm -rf "$HERE/source"
mkdir -p "$HERE/source"
cp -R "$HERE/../source-latest/." "$HERE/source/"
(cd "$HERE/source" && patch -p1 --batch < "$HERE/../generated/wonder-gaps-fix.patch")
cp "$HERE/confam-runtime.mjs" "$HERE/source/confam-runtime.mjs"
