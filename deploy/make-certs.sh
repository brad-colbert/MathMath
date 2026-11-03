#!/usr/bin/env bash
# Makes sure <certs folder> holds a server certificate for every name in HOSTNAMES (commas between them),
# signed by the private CA there. Creates the CA first if there is none. Run on the server.
# The folder holds private keys: it stays on the server, outside any synced folder, and is never deployed.
# Usage: HOSTNAMES=name1,name2,10.0.0.10 deploy/make-certs.sh <certs folder>
set -euo pipefail
DIR="${1:?usage: make-certs.sh <certs folder>}"
: "${HOSTNAMES:?set HOSTNAMES to the names the certificate covers}"
mkdir -p "$DIR" && chmod 700 "$DIR" && cd "$DIR"

if [ ! -s ca.key ] || [ ! -s ca.crt ]; then
  openssl req -x509 -newkey rsa:3072 -nodes -days 3650 -sha256 -keyout ca.key -out ca.crt \
    -subj "/CN=MathMath local CA" \
    -addext "basicConstraints=critical,CA:TRUE" -addext "keyUsage=critical,keyCertSign,cRLSign" 2>/dev/null
  chmod 600 ca.key
  echo "created a CA: import $DIR/ca.crt into each browser, trusted for websites"
fi

# Each name becomes a DNS or IP entry. A changed list makes a new certificate.
SAN=$(echo "$HOSTNAMES" | tr ',' '\n' | sed '/^$/d' | while read -r h; do
  if [[ "$h" =~ ^[0-9.]+$ || "$h" == *:* ]]; then echo "IP:$h"; else echo "DNS:$h"; fi
done | paste -sd, -)
if [ -s server.crt ] && [ -s server.key ] && [ "$(cat server.names 2>/dev/null)" = "$SAN" ] \
  && openssl x509 -in server.crt -noout -checkend 2592000 >/dev/null; then
  echo "certificate present for $SAN"
  exit 0
fi
FIRST=$(echo "$HOSTNAMES" | cut -d, -f1)
openssl req -newkey rsa:2048 -nodes -keyout server.key -out server.csr -subj "/CN=$FIRST" 2>/dev/null
cat > ext.cnf <<EXT
subjectAltName=$SAN
extendedKeyUsage=serverAuth
keyUsage=digitalSignature,keyEncipherment
basicConstraints=CA:FALSE
EXT
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial -days 825 -sha256 \
  -extfile ext.cnf -out server.crt 2>/dev/null
rm -f server.csr ext.cnf
# nginx reads it as root inside the container, so it can stay private to its owner.
chmod 600 server.key
echo "$SAN" > server.names
echo "certificate created for $SAN"
