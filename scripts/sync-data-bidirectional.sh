#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${PROJECT_ROOT}/data"
REMOTE_TARGET="${REMOTE_TARGET:-192.168.1.214:jsprojects/reader/data/}"
# Defaults avoid deletes to reduce accidental data loss; override if you need one-way deletes.
REMOTE_TO_LOCAL_FLAGS="${REMOTE_TO_LOCAL_FLAGS:--av --update}"
LOCAL_TO_REMOTE_FLAGS="${LOCAL_TO_REMOTE_FLAGS:--av --update}"

mkdir -p "${DATA_DIR}"

echo "Syncing remote -> local: ${REMOTE_TARGET} -> ${DATA_DIR}"
rsync ${REMOTE_TO_LOCAL_FLAGS} "${REMOTE_TARGET}" "${DATA_DIR}/"

echo "Syncing local -> remote: ${DATA_DIR} -> ${REMOTE_TARGET}"
rsync ${LOCAL_TO_REMOTE_FLAGS} "${DATA_DIR}/" "${REMOTE_TARGET}"
