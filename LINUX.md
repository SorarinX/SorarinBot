# Running SorarinBot on Linux

No Linux package is published for v3.0.0. The same root package builds on Linux and serves the same web console; build it from source.

## Build

```bash
git clone https://github.com/SorarinX/SorarinBot.git
cd SorarinBot

# Frontend — build the SPA into web/dist, where go:embed picks it up
cd web
npm install
npm run build
cd ..

# Backend
GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o SorarinBot .
```

Requires **Go 1.25+** and **Node.js 20+** with **npm**.

## Run

```bash
chmod +x SorarinBot
./SorarinBot
```

The dashboard opens at `http://localhost:8080`. The process keeps running in the foreground; the console hides itself once the dashboard is reachable.

- `-console` keeps the console visible (useful for logs).
- `-console-qr` prints the WeChat login QR in the terminal, for servers without a browser.
- `-listen 0.0.0.0:8080` exposes the dashboard on the LAN — set a password first, see [SECURITY.md](SECURITY.md).

## Data

`config.yaml`, `data.db` and `token.json` are created next to the binary. If that directory is read-only, they go to `~/.local/share/SorarinBot` instead.

## systemd (optional)

```ini
[Unit]
Description=SorarinBot
After=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/sorarinbot
ExecStart=/opt/sorarinbot/SorarinBot -console-qr
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now sorarinbot
journalctl -u sorarinbot -f
```

## Notes

- The WeChat Web protocol is unofficial; use an account you can afford to lose.
- No tray icon is available on a headless server. Use the web console, or `systemctl stop` to quit.
- The dashboard is plain HTTP. Put it behind a TLS reverse proxy before exposing it beyond localhost.
