#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "→ Building..."
npm run build

echo "→ Deploying to ~/.hermes/local-docs/"
rm -rf ~/.hermes/local-docs/*
cp -r dist/* ~/.hermes/local-docs/

echo "→ Restarting server..."
systemctl --user restart hermes-docs.service

echo "→ OK! http://sintez.local:8999/"
