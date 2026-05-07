#!/bin/sh
set -eu

if [ "${1:-}" = "serve" ]; then
  exec sync-subtitles-mfa-server
fi

if [ "${1:-}" = "bash" ] || [ "${1:-}" = "sh" ] || [ "${1:-}" = "mfa" ] || [ "${1:-}" = "python" ]; then
  exec "$@"
fi

exec sync-subtitles-mfa "$@"
