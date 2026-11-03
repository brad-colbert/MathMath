#!/usr/bin/env bash
# Runs MathMath in this terminal; Ctrl+C stops it.
#
#   scripts/serve.sh            the dev server: the page reloads as the code changes (port 5173)
#   scripts/serve.sh --built    builds, then serves the built app as a deployment would (port 4173)
#
# Other machines reach it by this machine's name. Vite refuses names it hasn't been told about, so
# this machine's names (hostname and hostname -f) are allowed, plus any listed in MATHMATH_HOSTS,
# separated by commas. Nothing is written to vite.config.ts.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -x node_modules/.bin/vite ] || [ ! -f public/giac/vendor/giacwasm.js ]; then
  echo "MathMath isn't set up yet. Run scripts/setup.sh first." >&2
  exit 1
fi

export __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS="$(hostname),$(hostname -f 2>/dev/null || hostname)${MATHMATH_HOSTS:+,$MATHMATH_HOSTS}"

case "${1:-}" in
  "") exec node_modules/.bin/vite --host ;;
  --built)
    npm run --silent build
    exec node_modules/.bin/vite preview --host
    ;;
  *)
    sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
