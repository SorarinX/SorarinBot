import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  useLoginStatus,
  type LoginSnapshot,
  type LoginState,
} from "../lib/useLoginStatus";
import { RefreshIcon } from "../components/icons";
import "../styles/welcome.css";

const APP_VERSION = "v2.4.0";
const GITHUB_URL = "https://github.com/SorarinX/SorarinBot";
const CAPABILITIES = ["多模型接入", "本地运行", "会话记忆", "图片理解"];

type StatusTone = "brand" | "amber" | "error" | "muted";

type StatusCopy = {
  label: string;
  note: string;
  tone: StatusTone;
};

const STATUS_COPY: Record<LoginState, StatusCopy> = {
  idle: {
    label: "等待登录",
    note: "微信登录服务已就绪。",
    tone: "muted",
  },
  hot_logging_in: {
    label: "正在登录",
    note: "正在复用已保存的登录态。",
    tone: "amber",
  },
  waiting_scan: {
    label: "等待扫码",
    note: "微信扫一扫，3 分钟内有效。",
    tone: "brand",
  },
  scanned: {
    label: "已扫码",
    note: "请在手机上确认登录。",
    tone: "amber",
  },
  logged_in: {
    label: "已登录",
    note: "微信已连接，可以进入工作台。",
    tone: "brand",
  },
  failed: {
    label: "登录失败",
    note: "登录未完成，请稍后重试。",
    tone: "error",
  },
};

function describeStatus(snapshot: LoginSnapshot): StatusCopy {
  if (snapshot.mode === "connecting") {
    return {
      label: "正在连接",
      note: "正在连接本地登录服务…",
      tone: "muted",
    };
  }

  if (snapshot.mode === "demo") {
    return {
      label: "等待连接",
      note: "本地服务未启动 · 启动后自动刷新",
      tone: "brand",
    };
  }

  const base = STATUS_COPY[snapshot.state];
  if (snapshot.state === "failed" && snapshot.lastError) {
    // The backend reports timeouts in English. Keep the UI Chinese while
    // preserving other (already localized) errors verbatim.
    const note = /timed\s*out|timeout/i.test(snapshot.lastError)
      ? "二维码已过期，请点「刷新二维码」重新获取。"
      : snapshot.lastError;
    return { ...base, note };
  }

  return base;
}

function GithubIcon() {
  return (
    <svg viewBox="0 0 24 24" className="welcome-github-icon" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2C6.48 2 2 6.58 2 12.26c0 4.55 2.87 8.41 6.84 9.77.5.09.68-.22.68-.49 0-.24-.01-.87-.01-1.71-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.89 1.57 2.34 1.12 2.91.86.09-.66.35-1.12.63-1.38-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05A9.38 9.38 0 0 1 12 6.84c.85 0 1.71.12 2.51.35 1.9-1.33 2.74-1.05 2.74-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.81-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .27.18.59.69.49A10.28 10.28 0 0 0 22 12.26C22 6.58 17.52 2 12 2z"
      />
    </svg>
  );
}

function QrIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="welcome-qr-icon"
      aria-hidden="true"
    >
      <path d="M4 9V6.5A2.5 2.5 0 0 1 6.5 4H9M15 4h2.5A2.5 2.5 0 0 1 20 6.5V9M20 15v2.5a2.5 2.5 0 0 1-2.5 2.5H15M9 20H6.5A2.5 2.5 0 0 1 4 17.5V15" />
      <rect x="8" y="8" width="3.2" height="3.2" rx=".6" />
      <rect x="12.8" y="8" width="3.2" height="3.2" rx=".6" />
      <rect x="8" y="12.8" width="3.2" height="3.2" rx=".6" />
      <path d="M12.8 12.8h1.2v1.2M16 12.8v.6M12.8 16h.8M15.2 15.2h.8v.8" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="welcome-enter-arrow"
      aria-hidden="true"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export default function WelcomePage() {
  const navigate = useNavigate();
  const login = useLoginStatus();
  const status = describeStatus(login);
  const [qrImageBroken, setQrImageBroken] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const isLoggedIn = login.state === "logged_in";
  const isFailed = login.state === "failed";
  const showQrImage = Boolean(login.qrUrl) && !qrImageBroken;

  useEffect(() => {
    const root = document.documentElement;
    const previousTitle = document.title;
    root.classList.add("welcome-active");
    document.title = "SorarinBot · 让微信替你思考";

    return () => {
      root.classList.remove("welcome-active");
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    setQrImageBroken(false);
  }, [login.qrUrl]);

  function enterWorkspace() {
    if (isLoggedIn) navigate("/dashboard");
  }

  async function refreshQr() {
    if (retrying) return;
    setRetrying(true);
    try {
      // The endpoint takes no body. A 2s status poll picks up waiting_scan.
      const response = await fetch("/api/login/retry", { method: "POST" });
      if (!response.ok) return;
      const payload: unknown = await response.json().catch(() => null);
      if (
        payload !== null &&
        typeof payload === "object" &&
        "ok" in payload &&
        payload.ok === false
      ) {
        return;
      }
    } catch {
      /* Keep the failed state; the button becomes clickable again. */
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div className="welcome-page">
      <div className="welcome-ambient welcome-ambient-mint" aria-hidden="true" />
      <div className="welcome-ambient welcome-ambient-gold" aria-hidden="true" />
      <div className="welcome-glow" aria-hidden="true" />
      <div className="welcome-noise" aria-hidden="true" />

      <div className="welcome-inner">
        <header className="welcome-topbar">
          <div className="welcome-wordmark">SorarinBot</div>

          <div className="welcome-top-actions">
            <a
              className="welcome-github"
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer noopener"
              aria-label="在 GitHub 上查看 SorarinBot"
              title="GitHub"
            >
              <GithubIcon />
              <span className="welcome-github-label">GitHub</span>
            </a>
          </div>
        </header>

        <main className="welcome-main">
          <section className="welcome-copy" aria-labelledby="welcome-title">
            <h1 id="welcome-title" className="welcome-title">
              <span className="welcome-title-line">让微信</span><span className="welcome-title-line">替你思考<span className="welcome-title-period">。</span></span>
            </h1>

            <p className="welcome-tagline">Your WeChat, with a brain.</p>
            <p className="welcome-description">
              让每一次微信对话，都拥有 AI 的思考能力。
            </p>
            <ul className="welcome-capabilities" aria-label="核心能力">
              {CAPABILITIES.map((capability) => (
                <li key={capability}>{capability}</li>
              ))}
            </ul>
          </section>

          <section className="welcome-login" aria-label="微信扫码登录">
            <div className="welcome-qr-shell">
              <div className="welcome-card-visual">
                <span className="welcome-card-halo" aria-hidden="true" />

                <div className="welcome-card">
                  <div className="welcome-card-heading">
                    <QrIcon />
                    <span>微信扫码登录</span>
                  </div>

                  <div
                    className={
                      "welcome-qr-frame" + (isFailed ? " is-failed" : "")
                    }
                    aria-busy={!showQrImage}
                  >
                    {showQrImage ? (
                      <img
                        key={login.qrUrl}
                        className="welcome-qr-image"
                        src={login.qrUrl}
                        alt="微信登录二维码"
                        onError={() => setQrImageBroken(true)}
                      />
                    ) : (
                      <div className="welcome-qr-waiting" aria-hidden="true">
                        <span className="welcome-scan-line" />
                      </div>
                    )}
                  </div>

                  <div
                    className="welcome-status"
                    data-tone={status.tone}
                    data-state={login.state}
                    role="status"
                    aria-live="polite"
                  >
                    <div className="welcome-status-line">
                      <span className="welcome-status-dot" aria-hidden="true" />
                      <span className="welcome-status-label">{status.label}</span>
                    </div>
                    <p className="welcome-status-note" title={status.note}>
                      {status.note}
                    </p>
                  </div>

                  <button
                    type="button"
                    className="welcome-enter-button"
                    onClick={isFailed ? () => void refreshQr() : enterWorkspace}
                    disabled={isFailed ? retrying : !isLoggedIn}
                    aria-busy={isFailed ? retrying : undefined}
                    title={
                      isFailed
                        ? retrying
                          ? "正在重新获取二维码"
                          : "重新获取登录二维码"
                        : isLoggedIn
                          ? undefined
                          : "完成微信扫码登录后可进入"
                    }
                  >
                    {isFailed ? (
                      <>
                        <span>{retrying ? "正在刷新…" : "刷新二维码"}</span>
                        <RefreshIcon className="welcome-enter-arrow" />
                      </>
                    ) : (
                      <>
                        <span>进入工作台</span>
                        <ArrowIcon />
                      </>
                    )}
                  </button>

                  {!isLoggedIn ? (
                    <Link to="/settings" className="welcome-skip">
                      先不扫码，去配置
                      <span aria-hidden="true">→</span>
                    </Link>
                  ) : null}
                </div>
              </div>
            </div>
          </section>
        </main>

        <footer className="welcome-footer">
          <p className="welcome-footer-spec">
            本地运行 <span aria-hidden="true">·</span> 数据不出机器{" "}
            <span aria-hidden="true">·</span> 开源可审计
          </p>
          <span className="welcome-footer-version">{APP_VERSION}</span>
        </footer>
      </div>
    </div>
  );
}
