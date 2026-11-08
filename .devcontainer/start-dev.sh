#!/usr/bin/env bash
set -euo pipefail
# Finish the lifecycle hook so Codespaces can attach while Next.js keeps running.
if curl --silent --fail --max-time 2 http://127.0.0.1:3000/ > /dev/null; then
  exit 0
fi
nohup npm run dev > /tmp/autotube-dev.log 2>&1 < /dev/null &
