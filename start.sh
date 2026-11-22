#!/usr/bin/env bash
# Starts FinSaathi locally: API on port 4000 and the Expo dev server on 8081. Stop with Ctrl+C.
#   Browser: press  w   |  Phone: scan the QR with Expo Go (same Wi-Fi)  |  Simulator: press i / a
set -euo pipefail
cd "$(dirname "$0")"

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export PATH="$HOME/.nvm/versions/node/$(ls -1 "$HOME/.nvm/versions/node" 2>/dev/null | tail -n 1)/bin:/usr/local/bin:/opt/homebrew/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"

LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || true)"

( cd backend && npm start ) &
BACK=$!
trap 'kill $BACK 2>/dev/null || true' EXIT INT TERM

for _ in $(seq 1 30); do
  curl -s -m 2 -o /dev/null http://127.0.0.1:4000/v1/health && break || sleep 1
done
echo "API ready: http://127.0.0.1:4000   (phone: http://${LAN_IP:-<your-ip>}:4000)"
echo "The app finds the API by itself. Phone and computer must be on the same Wi-Fi."

cd mobile
# REACT_NATIVE_PACKAGER_HOSTNAME makes the QR code use the Wi-Fi address instead of a VPN/virtual one.
REACT_NATIVE_PACKAGER_HOSTNAME="${LAN_IP:-}" npx expo start --port 8081 "$@"
