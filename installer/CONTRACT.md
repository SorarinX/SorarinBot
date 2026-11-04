# SorarinBot Installer Contract v1

Status: frozen for v3.1.0. Implementation must follow this file.

## 1. Product boundary

- Bootstrapper: Tauri 2 + WebView2 + React, version 1.x, stable across app releases.
- Payload: electron-builder NSIS, version = app version, built by CI.
- The bootstrapper never embeds app files. It reads a manifest, downloads a payload, verifies it, runs it silently.
- The installed app updates through electron-updater; the installer is not involved after first install.

## 2. Versions

| Component | Version | Rebuilt |
| --- | --- | --- |
| Bootstrapper | 1.0.0 | only on installer UI/logic changes |
| Manifest | follows app | every release |
| NSIS payload | 3.x | every release, CI |
| App | 3.x | every release |

The bootstrapper must reject a manifest whose `minBootstrapper` is greater than its own version.

## 3. Manifest

Hosted as a release asset and fetched from:

`https://github.com/SorarinX/SorarinBot/releases/latest/download/installer-manifest.json`

```json
{
  "schema": 1,
  "version": "3.1.0",
  "releasedAt": "2026-11-20T00:00:00Z",
  "payload": {
    "url": "https://github.com/SorarinX/SorarinBot/releases/download/v3.1.0/SorarinBot-3.1.0-Setup-payload.exe",
    "mirrors": ["https://example.invalid/SorarinBot-3.1.0-Setup-payload.exe"],
    "sha256": "64 lowercase hex chars",
    "size": 123456789
  },
  "minBootstrapper": "1.0.0",
  "notesUrl": "https://github.com/SorarinX/SorarinBot/releases/tag/v3.1.0",
  "update": {
    "baseUrls": ["https://example.invalid/updates"]
  },
  "features": [
    { "title": "多模型", "body": "DeepSeek / OpenAI / Ollama，任意兼容接口" },
    { "title": "本地运行", "body": "消息与密钥只留在你的电脑" },
    { "title": "开箱即用", "body": "安装完成后扫码即可开始" }
  ]
}
```

Rules:

- `sha256` and `size` are mandatory. Payload URL must be HTTPS.
- `mirrors` may be empty; order is manifest order.
- Unknown fields are ignored for forward compatibility.
- `schema` must be `1`; other values fail with `manifest_schema`.
- Version comparison is semver, numeric, no prerelease support in v1.

## 4. Install state machine

```
idle
  -> manifest_ready      manifest fetched and validated
  -> options             user confirmed install dir / import / shortcut
  -> downloading         payload transfer, cancel allowed
  -> verifying           sha256 + authenticode
  -> installing          payload /S, cancel disabled
  -> done                install.ok found, launch optional
  -> error               any failure, retry or change mirror
```

- Closing during `downloading` prompts and cancels.
- Closing during `installing` prompts but must not kill the payload; wait or background it.
- Retry from `error` reuses the downloaded file when sha256 still matches.

## 5. Tauri commands

All commands are async and return `Result<T, InstallerError>`.

| Command | Input | Output |
| --- | --- | --- |
| `fetch_manifest` | `urls: Vec<String>` | `Manifest` |
| `download_payload` | `url, dest, sha256, size` | emits `download-progress` |
| `verify_payload` | `path, sha256` | `VerifyResult { sha256_ok, signer, signed }` |
| `run_payload` | `path, install_dir` | `ExitCode` |
| `poll_install` | `install_dir, version, timeout_secs` | emits `install-progress` |
| `launch_app` | `install_dir` | `()` |
| `pick_directory` | `initial?: String` | `Option<String>` |
| `pick_data_source` | none | `Option<String>` |
| `import_data` | `source_dir, install_dir` | `ImportResult` |
| `cancel_download` | none | `()` |
| `open_log` | none | `()` |
| `installer_version` | none | `String` |

## 6. Events

```ts
type DownloadProgress = {
  received: number
  total: number
  percent: number
  bytesPerSecond: number
}

type InstallProgress = {
  percent: number
  phase: "extracting" | "registering" | "shortcuts" | "finishing"
}

type InstallerError = {
  code:
    | "manifest_unreachable" | "manifest_schema" | "bootstrapper_too_old"
    | "payload_download" | "payload_hash" | "payload_signature"
    | "payload_run" | "install_timeout" | "install_failed"
    | "path_invalid" | "path_not_writable" | "disk_full"
    | "data_import_invalid" | "cancelled"
  message: string
  detail?: string
}
```

## 7. Payload contract

- Built by electron-builder from `electron/`.
- Silent install: `payload.exe /S`.
- Install directory: passed through environment variable `SORARINBOT_INSTALL_DIR`. Do not rely on `/D=` quoting.
- Payload must:
  - close a running `SorarinBot.exe` (WM_CLOSE, then taskkill after timeout)
  - write `config.yaml` only if absent
  - never overwrite `data.db` or `token.json`
  - create start menu and desktop shortcuts
  - register the uninstaller
  - write `install.ok` at the end:

```json
{ "version": "3.1.0", "installedAt": "2026-11-20T00:00:00Z" }
```

- `installDir` is optional; the bootstrapper already knows the directory it passed in.
- Bootstrapper treats `install.ok` + matching version as success.
- Uninstall preserves user data by default.

## 8. Install directory and data

- Default: `%LOCALAPPDATA%\Programs\SorarinBot`.
- Per-user install, no admin, no UAC.
- A custom path must be absolute, writable, not a system directory, and not the payload directory.
- Data rules:
  - `config.yaml` is created only if absent.
  - `data.db` / `token.json` are never overwritten.
  - Import copies `config.yaml`, `data.db`, `token.json` from a user-picked folder.
  - Existing files are backed up to `.bak-<timestamp>` before import.
  - Import is all-or-nothing; on failure restore backups.

## 9. Download and verification

- Download to `%TEMP%\SorarinBot-Installer\<version>\payload.exe`.
- Verify byte size, SHA-256, then Authenticode via WinVerifyTrust.
- Unsigned payload is rejected in production builds; dev builds may allow it only when `SORARINBOT_ALLOW_UNSIGNED=1`.
- Retry each URL once; then next mirror.
- HTTP proxy follows system settings.

## 10. UI contract

- Window 1000×660 fixed, frameless, rounded, Mica/Acrylic, system theme.
- Pages: `welcome`, `options`, `progress`, `finish`.
- Design tokens come from `installer/app/src/styles/tokens.css`, generated by `installer/app/scripts/sync-tokens.mjs` from `web/src/styles/tokens.css`. CI fails on drift.
- No default NSIS controls, no console window, no emoji icons.
- Reduced motion is respected.

## 11. File ownership

| Area | Owner |
| --- | --- |
| `installer/design/**` | SA-1 |
| `installer/payload/**`, `electron/nsis/**`, `electron/package.json` | SA-2 |
| `tools/installer/**`, `.github/workflows/installer.yml`, `.github/workflows/release.yml` | SA-3 |
| `installer/app/**`, `installer/app/src-tauri/**` | SA-4 |
| `installer/CONTRACT.md`, `installer/manifest.schema.json`, integration | main agent |

## 12. Acceptance for v3.1.0

- Fresh install on clean Win10 22H2 and Win11 succeeds without admin.
- Installer UI matches the prototype in light and dark.
- Overwrite install preserves `config.yaml` / `data.db` / `token.json`.
- Import from a zip folder works and rolls back on failure.
- Finish page launches the app.
- 3.1.0 -> 3.1.1 updates through electron-updater without the installer.
- Uninstall preserves data by default.
- 100% and 150% DPI are not clipped.
- No console window flash.
- Unsigned dev build is clearly marked; signed release is the public gate.
