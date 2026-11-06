# Privacy Policy

**SorarinBot** is a local-first application. This policy explains what data the
application handles and where it goes.

## Data stored on your machine

SorarinBot stores its configuration, WeChat login token, conversation history,
and logs locally in the application directory (for example `config.yaml`,
`data.db`, `token.json`, and log files). These files are not uploaded to a
Sorarin-operated server.

## AI providers

When you send a message that triggers a reply, the message content needed for
that reply is sent to the AI endpoint **you configure** (for example DeepSeek,
OpenAI, MiniMax, Ollama, or a self-hosted gateway). That provider's own privacy
policy applies. SorarinBot does not operate a relay or proxy service.

## WeChat

SorarinBot connects to WeChat using the account you log in with. The login
session is kept locally so the app can reconnect. SorarinBot does not collect
your WeChat password.

## Telemetry

SorarinBot does not include analytics, telemetry, crash reporting, or advertising
SDKs. It does not send usage data to the maintainers.

## Dashboard

The local dashboard listens on `127.0.0.1` and is not exposed to the internet by
default. An optional dashboard password can be enabled in the configuration.

## Data deletion

You can delete the local data files at any time. Uninstalling the application
may preserve `config.yaml`, `data.db`, and `token.json` so that an upgrade does
not lose your settings; delete the application data directory to remove them.

## Contact

For privacy questions, open an issue at
<https://github.com/SorarinX/SorarinBot/issues> or email
**zyc2597376118@gmail.com**.

_Last updated: 2026-11-06_
