#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${PROJECT_ROOT}/data"
REMOTE_TARGET="${REMOTE_TARGET:-192.168.1.214:jsprojects/reader/data/}"
RSYNC_FLAGS="${RSYNC_FLAGS:--av --delete}"

if [[ ! -d "${DATA_DIR}" ]]; then
  echo "Data directory not found: ${DATA_DIR}" >&2
  exit 1
fi

echo "Syncing ${DATA_DIR} -> ${REMOTE_TARGET}"
rsync ${RSYNC_FLAGS} "${DATA_DIR}/" "${REMOTE_TARGET}"
