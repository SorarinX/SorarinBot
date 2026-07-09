#!/bin/bash
# SorarinBot Electron Linux Build Script
set -e

cd "$(dirname "$0")"

echo "=== SorarinBot Linux Build ==="
echo ""

# Cross-compile Go binary for Linux
echo "[1/4] Complying Go binary for linux/amd64..."
GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o SorarinBot ../..
cp SorarinBot electron/SorarinBot
echo "  -> $(ls -lh electron/SorarinBot | awk '{print $5}')"

# Install npm dependencies if needed
echo "[2/4] Checking npm dependencies..."
cd electron
if [ ! -d node_modules ]; then
    npm install
fi

# Switch to Linux package config
echo "[3/4] Switching to Linux package config..."
cp package.json package.json.bak
cp package-linux.json package.json

# Build Electron AppImage
echo "[4/4] Building Electron AppImage..."
export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
export ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
npx electron-builder --linux

# Restore original package.json
mv package.json.bak package.json

echo ""
echo "=== Build complete ==="
echo "Output: electron/release/"
ls -lh release/*.AppImage 2>/dev/null || echo "(check release/ for output)"
