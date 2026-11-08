#!/usr/bin/env bash
# MathMath: math on paper, in the browser.
# Copyright (C) 2026 Pelican Labs, LLC
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero
# General Public License as published by the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the
# implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public
# License for more details.
#
# You should have received a copy of the GNU Affero General Public License along with this program. If not,
# see <https://www.gnu.org/licenses/>.

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
