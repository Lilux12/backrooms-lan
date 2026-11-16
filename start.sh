#!/bin/sh
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Не найден Node.js. Установите его: https://nodejs.org"
  exit 1
fi
node server/index.js
