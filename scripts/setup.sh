#!/usr/bin/env bash
# First-time setup. Inside a Dropbox folder, the generated folders must be flagged as ignored
# before they fill, so create and flag them ahead of npm install.
set -euo pipefail
cd "$(dirname "$0")/.."

mkdir -p node_modules dist public/giac/vendor

case "$(pwd -P)/" in
  */Dropbox/*)
    command -v attr >/dev/null || { echo "setup: 'attr' is required inside Dropbox" >&2; exit 1; }
    attr -q -s com.dropbox.ignored -V 1 node_modules
    attr -q -s com.dropbox.ignored -V 1 dist
    attr -q -s com.dropbox.ignored -V 1 public/giac/vendor
    echo "setup: marked generated folders as ignored by Dropbox"
    ;;
esac

npm install
node scripts/fetch-giac.mjs
