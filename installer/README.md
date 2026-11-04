# SorarinBot Installer

The installer is a two-part system:

- **Bootstrapper** — Tauri 2 + WebView2 + React, version 1.x. It owns the UI, reads the manifest, downloads and verifies the payload, then runs it silently.
- **Payload** — an electron-builder NSIS package, version = app version. It installs the Electron shell and the Go backend per user.

The bootstrapper stays independent from the app version: a new release only replaces the payload and the manifest.

## Layout

```
installer/
├── CONTRACT.md              frozen command/event/manifest contract
├── manifest.schema.json     JSON schema for installer-manifest.json
├── app/                     React UI + Tauri host
│   ├── src/                 pages and styles
│   └── src-tauri/           Rust commands
├── payload/                 NSIS customisations
└── design/                  approved HTML prototype and screenshots
```

## Build the bootstrapper

Prerequisites: Node 20+, Rust stable (MSVC), WebView2 runtime.

```powershell
cd installer/app
npm install
npm run tauri build -- --no-bundle
```

Output: `installer/app/src-tauri/target/release/sorarinbot-installer.exe`.

For a quick UI-only preview:

```powershell
cd installer/app
npm run dev
```

In a browser the UI runs in mock mode (simulated download/install).

## Build the payload

Build the web frontend and the Go backend first, then:

```powershell
cd electron
npm install
npx electron-builder --win nsis --publish never
```

Output: `electron/release/SorarinBot-<version>-Setup-payload.exe`.

The payload reads the target directory from `SORARINBOT_INSTALL_DIR`; the bootstrapper sets it before launching `payload.exe /S`.

## Manifest

Hosted at:

```
https://github.com/SorarinX/SorarinBot/releases/latest/download/installer-manifest.json
```

Generate it with:

```powershell
node tools/installer/make-manifest.mjs --payload electron/release/SorarinBot-3.1.0-Setup-payload.exe --version 3.1.0 --notes-url https://github.com/SorarinX/SorarinBot/releases/tag/v3.1.0 --out out/installer-manifest.json
```

## Local end-to-end test

The Rust build accepts two development-only environment variables:

- `SORARINBOT_MANIFEST_URL` — manifest URL to try before the built-in GitHub URL.
- `SORARINBOT_ALLOW_HTTP=1` — allow `http://127.0.0.1` payload URLs for local testing.

Serve a manifest and the payload over localhost, then launch the bootstrapper with both variables. Without them the bootstrapper only accepts HTTPS.

## Signing

The build has signing hooks for `CSC_LINK` / `CSC_KEY_PASSWORD`; Tauri's Windows signing is not wired yet. Until a certificate exists, builds are unsigned and SmartScreen will warn. Do not call the public installer release done until the bootstrapper and payload are signed.

## Status

- Bootstrapper UI: Welcome, Options, Progress, Finish; light/dark system theme; 1000×660 fixed window.
- Rust commands: manifest fetch, HTTPS download, SHA-256, silent payload, install.ok polling, launch, folder pickers, data import.
- Payload: silent per-user install, config preserved, install.ok written.
- Local E2E: passed (download → verify → silent install → finish) with a localhost manifest.
- Not done: code signing, hosted manifest/release assets, electron-updater integration, WebView2 fallback UI.
