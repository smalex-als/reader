#!/usr/bin/env bash
set -euo pipefail

# Generate a self-signed cert/key pair with SAN entries that match your dev host/IP.
# Usage: ./scripts/generate-self-signed-cert.sh [hostname] [ip]
# Example: ./scripts/generate-self-signed-cert.sh myserver.home 192.168.1.174

HOSTNAME="${1:-myserver.home}"
IP_ADDR="${2:-192.168.1.174}"
OUT_DIR="${OUT_DIR:-certs}"
DAYS="${DAYS:-825}"

mkdir -p "${OUT_DIR}"
CONF_PATH="${OUT_DIR}/openssl.cnf"
KEY_PATH="${OUT_DIR}/${HOSTNAME}.key"
CERT_PATH="${OUT_DIR}/${HOSTNAME}.pem"

cat > "${CONF_PATH}" <<EOF
[ req ]
prompt = no
distinguished_name = dn
x509_extensions = v3_ext
[ dn ]
CN = ${HOSTNAME}
O = Local Dev
[ v3_ext ]
subjectAltName = DNS:${HOSTNAME},IP:${IP_ADDR}
basicConstraints = CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
EOF

openssl req -x509 -nodes -newkey rsa:2048 -days "${DAYS}" \
  -keyout "${KEY_PATH}" \
  -out "${CERT_PATH}" \
  -config "${CONF_PATH}" \
  -extensions v3_ext

cat <<EOF

Created:
  Key : ${KEY_PATH}
  Cert: ${CERT_PATH}

Trust on macOS (self-signed only):
  sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "${CERT_PATH}"

Then point your server to:
  HTTPS_KEY_PATH=${KEY_PATH}
  HTTPS_CERT_PATH=${CERT_PATH}
EOF
