#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

UUID=$(python3 -c 'import json; print(json.load(open("metadata.json"))["uuid"])')
ZIP_NAME="${UUID}.zip"
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT

tar \
  --exclude='./.git' \
  --exclude='./.git/*' \
  --exclude='./.github' \
  --exclude='./.github/*' \
  --exclude='./dist' \
  --exclude='./dist/*' \
  --exclude='./scripts' \
  --exclude='./scripts/*' \
  --exclude='./.gitlab-ci.yml' \
  --exclude='./prefs.log' \
  -cf - . | tar -xf - -C "$STAGE"

test -f "$STAGE/metadata.json"
test -f "$STAGE/extension.js"
test -f "$STAGE/prefs.js"
test -f "$STAGE/schemas/gschemas.compiled"

mkdir -p dist
(cd "$STAGE" && zip -qr "$OLDPWD/dist/$ZIP_NAME" .)
ls -lh "dist/$ZIP_NAME"
