#!/bin/bash
# Double-click to run Jovita on this Mac:
#   Landing page  → http://localhost:5174
#   The app       → http://localhost:5173  (log in with your usual Jovita email and password)
#   Jovita HQ     → http://localhost:5173/admin/  (super admin, desktop only)
# Close this window (or press Control+C) to stop.
cd "$(dirname "$0")"
if ! command -v npm >/dev/null 2>&1; then
  echo "Jovita needs Node.js. Opening nodejs.org — install the LTS version, then double-click this file again."
  open "https://nodejs.org/en/download"; read -p "Press Return to close."; exit 1
fi
[ -d node_modules ] || { echo "First run: installing (takes a minute)…"; npm install || { read -p "Install failed. Press Return to close."; exit 1; }; }
echo "Starting the landing page on http://localhost:5174"
npx vite public/landing --port 5174 --strictPort >/tmp/jovita-landing.log 2>&1 &
LANDING=$!
trap 'kill $LANDING 2>/dev/null' EXIT
(sleep 3; open "http://localhost:5174"; open "http://localhost:5173") &
echo "Starting the app on http://localhost:5173  ·  Jovita HQ on http://localhost:5173/admin/"
npm run dev -- --port 5173 --strictPort
