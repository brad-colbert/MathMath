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
