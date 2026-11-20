#!/bin/sh
# Copies the shared API contract into the app. Re-run whenever shared/contract.ts changes.
set -e
cd "$(dirname "$0")/.."
cp ../shared/contract.ts src/api/contract.ts
echo "contract synced"
