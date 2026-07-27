#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

# Проверка base path — CrewAI агенты любят перезаписывать на /crew_editor/
if grep -q "base: '/crew_editor'" vite.config.ts; then
  echo "⚠️  Fixing vite base — CrewAI reset to /crew_editor/"
  sed -i "s|base: '/crew_editor/'|base: './'|" vite.config.ts
  npm run build
fi

echo "→ Building frontend..."
npm run build

echo "→ Building & deploying with Docker Compose..."
sudo docker compose up --build -d --remove-orphans

echo "→ Cleaning up old systemd service..."
systemctl --user disable --now hermes-docs.service 2>/dev/null || true
rm -f ~/.config/systemd/user/hermes-docs.service
systemctl --user daemon-reload 2>/dev/null || true

echo "→ OK! http://sintez.local:8999/ (frontend + API proxy)"
echo "   API docs: http://sintez.local:8999/api/docs"
