#!/usr/bin/env bash
set -euo pipefail

# Keep Compose's image tag, platform, and overrides. Calling Bake directly lets
# us grant network.host explicitly (Compose 5.6.0 omits that grant).
docker compose "$@" build --print reader \
  | docker buildx bake --file - --allow=network.host --progress=plain reader
