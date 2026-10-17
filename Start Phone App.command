#!/bin/bash
# Double-click to run the Jovita phone app from this Mac.
# 1. Install "Expo Go" on your phone (App Store or Google Play).
# 2. Keep the phone on the same Wi-Fi as this Mac.
# 3. Scan the QR code that appears below (iPhone: Camera app · Android: Expo Go → Scan).
# Log in with your usual Jovita email and password.
cd "$(dirname "$0")/mobile"
if ! command -v npm >/dev/null 2>&1; then
  echo "This needs Node.js. Opening nodejs.org — install the LTS version, then double-click this file again."
  open "https://nodejs.org/en/download"; read -p "Press Return to close."; exit 1
fi
[ -d node_modules ] || { echo "First run: installing (takes a few minutes)…"; npm install || { read -p "Install failed. Press Return to close."; exit 1; }; }
# If your phone can't connect on Wi-Fi, close this and run:  cd mobile && npx expo start --tunnel
npx expo start
