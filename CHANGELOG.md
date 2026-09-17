# Changelog

Notable changes to SorarinBot. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Hardening pass: licence compliance, dashboard authentication, and the removal of
config keys that never did anything.

### Added

- **Dashboard authentication.** Setting `admin.password_hash` now gates every
  `/api` route and the `/ws` heartbeat behind a session cookie, with a login
  screen in the dashboard and a 退出登录 entry in the user menu. Implemented with
  `crypto/pbkdf2` and `crypto/hmac` only, so the dependency list is unchanged.
  Authentication is off while the hash is empty, which keeps a localhost-only
  install zero-config.
- **`SorarinBot -set-password`** writes an `admin.password_hash` into
  `config.yaml` and exits. An empty answer turns authentication back off.
- **`SorarinBot -listen <addr>`** overrides `web.listen` for a single run.
- **`THIRD_PARTY_NOTICES.md`**, recording that `internal/openwechat/` is a fork
  of Apache-2.0 code and describing exactly how it differs from upstream.
- **`internal/openwechat/LICENSE`**, the upstream Apache License 2.0 text, which
  the Apache licence requires a redistributor to keep.
- Login throttling: eight failed attempts from one address within five minutes
  are refused with `429`, tracked per IP and with a bounded table.
- A warning in both READMEs that the dashboard is plain HTTP and must not be
  exposed to the internet, and that running a personal account over the WeChat
  Web protocol risks the account being restricted.

### Changed

- `chat.image_ttl` is now read. It was previously parsed and then ignored in
  favour of a hardcoded five-minute constant, so the setting did nothing.
- `wechat.auto_login` is now read. Setting it to `false` skips the saved token
  and goes straight to a QR code, which is the way to replace a session.
- The Electron shell picks a free port and passes it to the backend with
  `-listen`, then waits for that exact port and verifies the `/api/status`
  payload before opening a window. Previously it assumed 8080, so a busy port
  meant either a timeout or loading a different application that happened to
  answer on 8080.
- The Electron shell spawns the backend directly instead of through
  `cmd /c start`. A `start` child exits immediately, so the previous code held a
  handle to a dead shell and the backend survived as an orphan after the window
  closed.
- Both READMEs rewritten as a linked English/Chinese pair with a committed
  architecture diagram. The “From Web to Electron” section is gone, and the
  hardcoded version strings with it.

### Removed

- `chat.context_enabled`. It was parsed and never read, and `chat.max_context: 0`
  already turns memory off, so there were two ways to express one thing.
- `wechat.strict_login`. Parsed and never read. The login policy — five token
  attempts, then one scan, then park in `failed` — was frozen deliberately, and
  a bypass knob would reopen it.
- `plugins` (and `plugins.enabled`). Parsed and never read; there is no plugin
  system to enable.
- `adapters/openwechat/platform_windows.go` and `platform_linux.go`, which
  defined an `openBrowser` that nothing called.

### Fixed

- `SorarinBot -set-password` no longer stores a password it cannot verify. A
  shell that prefixes what it pipes in — Windows PowerShell 5.1 writes a UTF-8
  BOM — produced a hash of something the operator never typed, and the only
  symptom was "密码错误" at the login screen with no way to tell why. A leading
  BOM and NUL bytes are now dropped, and any other non-printable character is
  reported instead of hashed.
- Path traversal in `web/preview-server.cjs`: a request such as
  `/../../secret` resolved outside the served directory. Paths are now decoded,
  resolved, and rejected unless they land inside the distribution folder.
- `go.mod` no longer marks `github.com/energye/systray` as an indirect
  dependency; it is imported directly by `systray.go`.

### Corrected documentation

- The “Known Limitations” and dead-code claims in earlier notes were wrong on
  two counts and are corrected here: `heartbeat.go` is live (`main.go` consumes
  `heartbeat.Done()` to exit when no browser is connected), and `IsJoinGroup`
  and `session.OnTaskPanic` are both reachable and used.

## [2.3.0] - 2026-09-17

Session isolation, asynchronous message handling, and an observable login state
machine.

### Added

- Sessions keyed by stable identifiers instead of nicknames —
  `private:<userName>` and `group:<roomUserName>:<userName>` — so the same person
  in two groups, or in a group and a private chat, no longer shares context.
- The real room user name (`@@xxx@chatroom`) is persisted into `messages.room`;
  it was previously always empty.
- Asynchronous dispatch: an LLM call no longer blocks the WeChat sync loop.
- One strict serial worker per session, with a bounded 16-deep backlog and
  panic isolation. Global provider concurrency is capped at 8.
- A six-state login machine (`idle`, `hot_logging_in`, `waiting_scan`, `scanned`,
  `logged_in`, `failed`) with `/api/login` and `/api/login/retry`, surfaced in the
  dashboard with a retry button.

### Fixed

- A failed WeChat login no longer takes the process down.
- Nil dereference when `Sender()` returned `(nil, err)`.
- Silent `ReplyText` failures are now logged.
- The dedup fallback key was not injective; it is now length-prefixed and only
  used when no real `msgId` exists.
- Identical messages sent twice within two minutes are both answered.

## [2.2.0] - 2026-07-09

- System tray with a Chinese menu, registry-based auto-start, a settings toggle
  for it, and a Linux port.

## [2.1.0] - 2026-07-09

- Bug fixes (provider race, nil panic, image cache), the PolyForm Noncommercial
  licence, and a bilingual README.

## [2.0.0] - 2026-07-07

- Electron desktop shell, NSIS installer, and a WebSocket heartbeat.

## [1.0.2] - 2026-07-06

- Feature and bug-fix release on top of the initial version.

## [1.0.0] - 2026-07-06

- Initial release: WeChat AI assistant with multi-model support and a web
  dashboard.

[Unreleased]: https://github.com/SorarinX/SorarinBot/compare/v2.3.0...HEAD
[2.3.0]: https://github.com/SorarinX/SorarinBot/releases/tag/v2.3.0
[2.2.0]: https://github.com/SorarinX/SorarinBot/releases/tag/v2.2.0
[2.1.0]: https://github.com/SorarinX/SorarinBot/releases/tag/v2.1.0
[2.0.0]: https://github.com/SorarinX/SorarinBot/releases/tag/v2.0.0
[1.0.2]: https://github.com/SorarinX/SorarinBot/releases/tag/v1.0.2
[1.0.0]: https://github.com/SorarinX/SorarinBot/releases/tag/v1.0.0
