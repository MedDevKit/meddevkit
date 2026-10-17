#!/usr/bin/env bash
# First npm publish of a NEW @meddevkit package, run once per package.
#
# npm only lets you add a trusted publisher to a package that already exists,
# so the very first version has to be published by a person. Every later
# version is published by .github/workflows/release.yml (trusted publishing).
#
# Run this in your own terminal, not through Claude Code's `!` prefix: npm's
# browser/security-key approval needs an interactive terminal.
#
#   scripts/first-publish.sh packages/<dir>
set -euo pipefail

PKG_DIR="${1:?usage: scripts/first-publish.sh packages/<dir>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/$PKG_DIR"

NAME="$(node -p "require('./package.json').name")"
VERSION="$(node -p "require('./package.json').version")"

if npm view "$NAME" version --prefer-online >/dev/null 2>&1; then
  echo "$NAME is already on npm. Release it with a tag instead (see CLAUDE.md)." >&2
  exit 1
fi

if [ ! -t 0 ]; then
  echo "Run this in your own terminal: npm's browser approval needs a TTY." >&2
  exit 1
fi

# An expired login makes `npm publish` fail with a misleading 404.
if ! npm whoami >/dev/null 2>&1; then
  echo "Not logged in to npm; opening browser login..."
  npm login --auth-type=web
fi
echo "npm user: $(npm whoami)"

pnpm --dir "$ROOT" -r --filter "$NAME..." build

echo "Publishing $NAME@$VERSION; approve with your security key in the browser."
npm publish --access public --auth-type=web

echo "Waiting for the registry..."
for _ in $(seq 1 40); do
  if npm view "$NAME@$VERSION" version --prefer-online >/dev/null 2>&1; then
    break
  fi
  sleep 15
done
npm view "$NAME@$VERSION" version --prefer-online >/dev/null

SETTINGS_URL="https://www.npmjs.com/package/$NAME/access"
cat <<EOF

$NAME@$VERSION is on npm.

Last step: add the trusted publisher (opening $SETTINGS_URL)
  Publisher:          GitHub Actions
  Organization:       MedDevKit
  Repository:         meddevkit
  Workflow filename:  release.yml
  Environment:        (leave blank)

npm expires a new trusted publisher if it has not published within 2 days,
so release the next version by tag soon after adding it.
EOF
open "$SETTINGS_URL" 2>/dev/null || true
