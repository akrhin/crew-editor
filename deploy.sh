#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

# Проверка base path — CrewAI агенты любят перезаписывать на /crew_editor/
if grep -q "base: '/crew_editor'" vite.config.ts; then
  echo "⚠️  Fixing vite base — CrewAI reset to /crew_editor/"
  sed -i "s|base: '/crew_editor/'|base: './'|" vite.config.ts
  npm run build
fi

echo "→ Building..."
npm run build

echo "→ Deploying to ~/.hermes/local-docs/"
rm -rf ~/.hermes/local-docs/*
cp -r dist/* ~/.hermes/local-docs/

echo "→ Restarting server..."
systemctl --user restart hermes-docs.service

echo "→ OK! http://sintez.local:8999/"
