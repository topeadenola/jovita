#!/bin/bash
# Double-click to open Jovita HQ (the super admin) on this Mac:
#   Jovita HQ → http://localhost:5175/admin/
# Sign in with your Jovita email and password. Close this window (or press Control+C) to stop.
cd "$(dirname "$0")"
if ! command -v npm >/dev/null 2>&1; then
  echo "Jovita needs Node.js. Opening nodejs.org — install the LTS version, then double-click this file again."
  open "https://nodejs.org/en/download"; read -p "Press Return to close."; exit 1
fi
[ -d node_modules ] || { echo "First run: installing (takes a minute)…"; npm install || { read -p "Install failed. Press Return to close."; exit 1; }; }
(sleep 3; open "http://localhost:5175/admin/") &
echo "Starting Jovita HQ on http://localhost:5175/admin/"
npx vite --port 5175 --strictPort
