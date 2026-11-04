#!/usr/bin/env bash
# Deploys a committed version of MathMath: unpacks it on the server, makes sure there's a certificate,
# builds the image there and restarts the container, then checks it answers with the security policy.
#
#   deploy/deploy.sh             the latest tag
#   deploy/deploy.sh v0.8.0      a tag, branch or commit
#   deploy/deploy.sh --working   the working copy's tracked and new files, for testing a change before it's
#                                committed (files git ignores or excludes are left out)
#
# Settings come from deploy/.env (copy deploy/.env.example). Only files git knows about are sent, never the
# whole folder. The server never needs access to the git repository.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f deploy/.env ] || { echo "Copy deploy/.env.example to deploy/.env and fill it in." >&2; exit 1; }
set -a; . deploy/.env; set +a
: "${REMOTE:?set REMOTE in deploy/.env}" "${REMOTE_DIR:?set REMOTE_DIR in deploy/.env}" "${HOSTNAMES:?set HOSTNAMES in deploy/.env}"
HTTPS_PORT="${HTTPS_PORT:-8888}"
REF="${1:-$(git describe --tags --abbrev=0)}"

if [ "$REF" = "--working" ]; then
  LABEL="working copy at $(git rev-parse --short HEAD)$(git diff --quiet HEAD && echo '' || echo ', with changes')"
  pack() { git ls-files -z -c -o --exclude-standard | tar --null -T - -cf -; }
else
  COMMIT=$(git rev-parse --verify --quiet "$REF^{commit}") || { echo "No such tag, branch or commit: $REF" >&2; exit 1; }
  LABEL="$REF ($(git rev-parse --short "$COMMIT"))"
  pack() { git archive --format=tar "$COMMIT"; }
fi

echo ">> Deploying $LABEL to $REMOTE:$REMOTE_DIR"
ssh "$REMOTE" "rm -rf '$REMOTE_DIR/app.new' && mkdir -p '$REMOTE_DIR/app.new'"
pack | ssh "$REMOTE" "tar -x -C '$REMOTE_DIR/app.new'"
# Giac goes from here, checked against its pinned hash, so a deploy doesn't depend on the site it comes from
# being up. The build checks the hash again and only downloads when the file is missing.
node scripts/fetch-giac.mjs
ssh "$REMOTE" "mkdir -p '$REMOTE_DIR/app.new/public/giac/vendor'"
scp -q public/giac/vendor/giacwasm.js "$REMOTE:$REMOTE_DIR/app.new/public/giac/vendor/giacwasm.js"
ssh "$REMOTE" "rm -rf '$REMOTE_DIR/app' && mv '$REMOTE_DIR/app.new' '$REMOTE_DIR/app'"

echo ">> Certificate"
ssh "$REMOTE" "cd '$REMOTE_DIR/app' && HOSTNAMES='$HOSTNAMES' bash deploy/make-certs.sh '$REMOTE_DIR/certs'"

echo ">> Building and starting"
ssh "$REMOTE" "cd '$REMOTE_DIR/app' && HTTPS_PORT='$HTTPS_PORT' docker compose -f deploy/docker-compose.yml up -d --build"

echo ">> Checking"
ssh "$REMOTE" "for i in \$(seq 1 30); do curl -sk -o /dev/null https://localhost:$HTTPS_PORT/ && break; sleep 1; done
  code=\$(curl -sk -o /dev/null -w '%{http_code}' https://localhost:$HTTPS_PORT/)
  csp=\$(curl -skI https://localhost:$HTTPS_PORT/ | grep -ci '^content-security-policy:')
  echo \"page: HTTP \$code, security policy header: \$csp\"
  [ \"\$code\" = 200 ] && [ \"\$csp\" = 1 ]"
# Written only once it's running, so the marker never names a build that failed.
echo "$LABEL, deployed $(date -Iseconds)" | ssh "$REMOTE" "cat > '$REMOTE_DIR/app/DEPLOYED'"
FIRST=$(echo "$HOSTNAMES" | cut -d, -f1)
echo ">> Done: https://$FIRST:$HTTPS_PORT/  ($LABEL)"
