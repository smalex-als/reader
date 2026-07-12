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

  # Skip if another server deploy is still running.
  exec 9>/tmp/reader-deploy.lock
  flock -n 9 || exit 0

  trap 'log "deploy failed (exit $?)"' ERR

  git fetch origin main

  LOCAL="$(git rev-parse HEAD)"
  REMOTE="$(git rev-parse origin/main)"
  UPDATED=false

  if [ "$LOCAL" != "$REMOTE" ]; then
    log "deploying ${LOCAL:0:7} -> ${REMOTE:0:7}"
    git pull --ff-only origin main
    UPDATED=true
  fi

  COMPOSE_ARGS=(up -d)
  if [ "$UPDATED" = true ]; then
    COMPOSE_ARGS+=(--build)
  fi

  CERT_DIR="${HOME}/dev/certs2"
  if [ ! -f "${CERT_DIR}/reader.test.pem" ] || [ ! -f "${CERT_DIR}/reader.test.key" ]; then
    log "server deploy requires ${CERT_DIR}/reader.test.pem and reader.test.key"
    return 1
  fi
  docker compose --profile https "${COMPOSE_ARGS[@]}" redis reader

  HEALTH_URL="http://127.0.0.1:3000/api/health"
  HEALTHY=false
  for _attempt in {1..30}; do
    if docker compose exec -T reader curl --fail --silent --show-error "$HEALTH_URL" >/dev/null; then
      HEALTHY=true
      break
    fi
    sleep 1
  done
  if [ "$HEALTHY" != true ]; then
    docker compose logs --tail=100 reader redis >> "$LOG_FILE" 2>&1 || true
    log "health check failed: ${HEALTH_URL}"
    return 1
  fi

  # nginx resolves the Reader service through Docker DNS. Recreate only the
  # proxy after Reader is healthy so deploys cannot retain an old container IP.
  docker compose --profile https up -d --no-deps --force-recreate nginx

  PROXY_HEALTH_URL="https://127.0.0.1:3001/api/health"
  PROXY_HEALTHY=false
  for _attempt in {1..30}; do
    if curl --insecure --fail --silent --show-error "$PROXY_HEALTH_URL" >/dev/null; then
      PROXY_HEALTHY=true
      break
    fi
    sleep 1
  done
  if [ "$PROXY_HEALTHY" != true ]; then
    docker compose --profile https logs --tail=100 nginx >> "$LOG_FILE" 2>&1 || true
    log "nginx health check failed: ${PROXY_HEALTH_URL}"
    return 1
  fi

  if [ "$UPDATED" = true ]; then
    docker image prune -f >/dev/null
  fi

  log "deploy succeeded at $(git rev-parse --short HEAD) (Reader, Redis, and nginx healthy)"
}

main "$@"
