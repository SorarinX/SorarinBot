@echo off
cd /d "%~dp0"
echo SorarinBot Electron Build
echo.

set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
set ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/

if not exist node_modules (
    echo Installing dependencies...
    call npm install
)

echo Building...
call npx electron-builder --win

echo Done! Check release/ folder.
pause
