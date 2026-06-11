#!/usr/bin/env bash
set -euo pipefail

# Body lives in a function so bash parses the whole script before running it;
# otherwise the git pull below could rewrite this file mid-execution.
main() {
  cd ~/jsprojects/reader

  LOG_FILE=./deploy.log

  log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG_FILE"
  }

  # Skip if another deploy is still running.
  exec 9>/tmp/reader-deploy.lock
  flock -n 9 || exit 0

  trap 'log "deploy failed (exit $?)"' ERR

  git fetch origin main

  LOCAL="$(git rev-parse HEAD)"
  REMOTE="$(git rev-parse origin/main)"

  if [ "$LOCAL" = "$REMOTE" ]; then
    exit 0
  fi

  log "deploying ${LOCAL:0:7} -> ${REMOTE:0:7}"

  git pull --ff-only origin main
  docker compose up --build -d
  docker image prune -f >/dev/null

  log "deploy succeeded at $(git rev-parse --short HEAD)"
}

main "$@"
