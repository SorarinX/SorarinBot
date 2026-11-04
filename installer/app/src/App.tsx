import { useEffect, useMemo, useRef, useState } from "react";
import {
  MOCK_INSTALL_DIR,
  MOCK_MANIFEST,
  formatBytes,
  type DownloadProgress,
  type Feature,
  type Manifest,
  type Phase,
} from "./lib/contracts";
import {
  cancelDownload,
  closeWindow,
  defaultInstallDir,
  downloadPayload,
  fetchManifest,
  importData,
  isTauri,
  launchApp,
  minimizeWindow,
  onInstallProgress,
  openPath,
  pickDataSource,
  pickDirectory,
  pollInstall,
  runPayload,
  verifyPayload,
} from "./lib/tauri";

type Page = "welcome" | "options" | "progress" | "finish";

function errorText(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "网络不可用";
}

const MANIFEST_URLS = [
  "https://github.com/SorarinX/SorarinBot/releases/latest/download/installer-manifest.json",
];

const STEPS: Array<{ id: Page; label: string }> = [
  { id: "welcome", label: "欢迎" },
  { id: "options", label: "选项" },
  { id: "progress", label: "进度" },
  { id: "finish", label: "完成" },
];

function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

function Icon({ name, className = "icon" }: { name: string; className?: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (name) {
    case "layers":
      return (
        <svg className={className} viewBox="0 0 24 24" {...common}>
          <path d="M12 3 3 7.5l9 4.5 9-4.5L12 3Z" />
          <path d="m3 12 9 4.5 9-4.5" />
          <path d="m3 16.5 9 4.5 9-4.5" />
        </svg>
      );
    case "shield":
      return (
        <svg className={className} viewBox="0 0 24 24" {...common}>
          <path d="M12 3 5 6v5c0 4.4 2.9 8.2 7 9.5 4.1-1.3 7-5.1 7-9.5V6l-7-3Z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
    case "spark":
      return (
        <svg className={className} viewBox="0 0 24 24" {...common}>
          <path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z" />
          <path d="M18.5 15.5 19.3 18l2.5.8-2.5.8-.8 2.5-.8-2.5-2.5-.8 2.5-.8.8-2.5Z" />
        </svg>
      );
    case "folder":
      return (
        <svg className={className} viewBox="0 0 24 24" {...common}>
          <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v8A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5v-10Z" />
        </svg>
      );
    case "download":
      return (
        <svg className={className} viewBox="0 0 24 24" {...common}>
          <path d="M12 4v11" />
          <path d="m7 11 5 5 5-5" />
          <path d="M5 20h14" />
        </svg>
      );
    case "check":
      return (
        <svg className={className} viewBox="0 0 24 24" {...common}>
          <path d="m5 12.5 4.5 4.5L19 7.5" />
        </svg>
      );
    case "sun":
      return (
        <svg className={className} viewBox="0 0 24 24" {...common}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
        </svg>
      );
    case "moon":
      return (
        <svg className={className} viewBox="0 0 24 24" {...common}>
          <path d="M20 14.5A8 8 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z" />
        </svg>
      );
    case "minus":
      return (
        <svg className={className} viewBox="0 0 24 24" {...common}>
          <path d="M5 12h14" />
        </svg>
      );
    case "close":
      return (
        <svg className={className} viewBox="0 0 24 24" {...common}>
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      );
    case "arrow":
      return (
        <svg className={className} viewBox="0 0 24 24" {...common}>
          <path d="M5 12h14" />
          <path d="m13 6 6 6-6 6" />
        </svg>
      );
    case "back":
      return (
        <svg className={className} viewBox="0 0 24 24" {...common}>
          <path d="M19 12H5" />
          <path d="m11 6-6 6 6 6" />
        </svg>
      );
    case "refresh":
      return (
        <svg className={className} viewBox="0 0 24 24" {...common}>
          <path d="M20 11a8 8 0 1 0-2.3 5.7" />
          <path d="M20 4v7h-7" />
        </svg>
      );
    case "external":
      return (
        <svg className={className} viewBox="0 0 24 24" {...common}>
          <path d="M14 4h6v6" />
          <path d="M20 4 11 13" />
          <path d="M19 14v4.5A1.5 1.5 0 0 1 17.5 20h-13A1.5 1.5 0 0 1 3 18.5v-13A1.5 1.5 0 0 1 4.5 4H9" />
        </svg>
      );
    default:
      return null;
  }
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={cn("toggle", checked && "is-on")}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}

function App() {
  const [page, setPage] = useState<Page>("welcome");
  const [phase, setPhase] = useState<Phase>("download");
  const [manifest, setManifest] = useState<Manifest>(MOCK_MANIFEST);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [installDir, setInstallDir] = useState(MOCK_INSTALL_DIR);
  const [importSource, setImportSource] = useState<string | null>(null);
  const [desktopShortcut, setDesktopShortcut] = useState(true);
  const [progress, setProgress] = useState(0);
  const [received, setReceived] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [signed, setSigned] = useState<boolean | null>(null);
  const [launchAfter, setLaunchAfter] = useState(true);
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem("sorarin-installer-theme");
    if (saved === "dark") return true;
    if (saved === "light") return false;
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });
  const timers = useRef<number[]>([]);
  const cancelled = useRef(false);

  const features: Feature[] = manifest.features && manifest.features.length > 0 ? manifest.features : MOCK_MANIFEST.features!;
  const percent = Math.max(0, Math.min(100, Math.round(progress)));
  const currentIndex = Math.max(0, STEPS.findIndex((step) => step.id === page));
  const verifying = phase === "verify";
  const installing = phase === "install";
  const ringLabel = installing ? "安装进度" : verifying ? "校验进度" : "下载进度";
  const detailKicker = installing ? "INSTALLATION PHASE" : verifying ? "VERIFYING PAYLOAD" : "DOWNLOADING PAYLOAD";
  const detailTitle = installing ? "正在写入程序文件" : verifying ? "正在校验安装包" : "正在下载安装包";
  const detailSub = installing ? "解压运行时 · 注册应用 · 创建快捷方式" : verifying ? "SHA-256 + Authenticode" : "SorarinBot-" + manifest.version + "-Setup-payload.exe";
  const phaseLabel = phase === "error" ? "等待重试" : installing ? "正在写入程序文件" : verifying ? "正在校验安装包" : "等待下载完成";
  const phaseBadge = phase === "error" ? "已停止" : installing ? "进行中" : verifying ? "校验中" : "排队中";

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("sorarin-installer-theme", dark ? "dark" : "light");
  }, [dark]);

  useEffect(() => {
    if (!isTauri()) return;
    let alive = true;
    (async () => {
      try {
        const next = await fetchManifest(MANIFEST_URLS);
        if (alive) setManifest(next);
      } catch (err) {
        if (alive) setManifestError(errorText(err));
      }
      try {
        const dir = await defaultInstallDir();
        if (alive) setInstallDir(dir);
      } catch {
        // keep the placeholder path
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current.forEach((id) => window.clearInterval(id));
  }, []);

  function later(fn: () => void, ms: number) {
    const id = window.setTimeout(fn, ms);
    timers.current.push(id);
  }

  function clearTimers() {
    timers.current.forEach((id) => {
      window.clearTimeout(id);
      window.clearInterval(id);
    });
    timers.current = [];
  }

  function finishMock() {
    setProgress(100);
    setPhase("done");
    setPage("finish");
  }

  function runMock() {
    clearTimers();
    cancelled.current = false;
    setPhase("download");
    setProgress(0);
    setReceived(0);
    setSpeed(8.4 * 1024 * 1024);
    const total = manifest.payload.size;
    let value = 0;
    const id = window.setInterval(() => {
      value = Math.min(70, value + 3.2);
      setProgress(value);
      setReceived((total * value) / 70);
      if (value >= 70) {
        window.clearInterval(id);
        setPhase("verify");
        setProgress(73);
        later(() => {
          setSigned(true);
          setPhase("install");
          setProgress(78);
          let installValue = 78;
          const installTimer = window.setInterval(() => {
            installValue = Math.min(99, installValue + 2.1);
            setProgress(installValue);
            if (installValue >= 99) {
              window.clearInterval(installTimer);
              later(finishMock, 450);
            }
          }, 90);
          timers.current.push(installTimer);
        }, 750);
      }
    }, 85);
    timers.current.push(id);
  }

  async function beginInstall() {
    setPage("progress");
    setPhase("download");
    setProgress(0);
    setError(null);
    setSigned(null);
    if (!isTauri()) {
      runMock();
      return;
    }
    clearTimers();
    cancelled.current = false;
    let offInstall: (() => void) | undefined;
    try {
      const urls = [manifest.payload.url, ...(manifest.payload.mirrors || [])].filter(Boolean);
      const path = await downloadPayload(urls, manifest.payload.sha256, manifest.payload.size, manifest.version, (p: DownloadProgress) => {
        setReceived(p.received);
        setSpeed(p.bytesPerSecond);
        setProgress(Math.min(70, p.percent * 0.7));
      });
      if (cancelled.current) throw new Error("已取消下载");
      setPhase("verify");
      setProgress(73);
      const verified = await verifyPayload(path, manifest.payload.sha256);
      if (!verified.sha256Ok) throw new Error("安装包 SHA-256 校验失败");
      setSigned(verified.signed);
      setPhase("install");
      setProgress(78);
      offInstall = await onInstallProgress((event) => {
        setProgress(Math.max(78, Math.min(99, event.percent)));
      });
      const [exitCode, ok] = await Promise.all([
        runPayload(path, installDir),
        pollInstall(installDir, manifest.version, 120),
      ]);
      if (exitCode !== 0) throw new Error("安装程序返回错误码 " + exitCode);
      if (!ok) throw new Error("安装未完成：没有找到 install.ok");
      if (importSource) {
        await importData(importSource, installDir);
      }
      setProgress(100);
      setPhase("done");
      setPage("finish");
    } catch (err) {
      setPhase("error");
      setError(errorText(err));
    } finally {
      offInstall?.();
    }
  }

  async function handleCancel() {
    cancelled.current = true;
    clearTimers();
    if (isTauri()) {
      try {
        await cancelDownload();
      } catch {
        // the download may already have finished
      }
    }
    setPhase("error");
    setError("已取消下载。你可以返回修改选项后重试。");
  }

  async function handleClose() {
    if (page === "progress" && (phase === "download" || phase === "verify" || phase === "install")) {
      if (!window.confirm("安装仍在进行，关闭窗口会中断安装。确定关闭吗？")) return;
    }
    await closeWindow();
  }

  async function handleBrowse() {
    if (!isTauri()) return;
    try {
      const picked = await pickDirectory(installDir);
      if (picked) setInstallDir(picked);
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function handlePickSource() {
    if (!isTauri()) return;
    try {
      const picked = await pickDataSource();
      if (picked) setImportSource(picked);
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function handleFinish() {
    try {
      if (launchAfter) await launchApp(installDir);
    } catch {
      // closing is still the right end state
    }
    await closeWindow();
  }

  return (
    <div className="installer">
      <aside className="rail">
        <div className="rail-glow rail-glow-a" />
        <div className="rail-glow rail-glow-b" />
        <div className="rail-grid" />
        <div className="rail-top">
          <img className="rail-logo" src="/logo.png" alt="" />
          <div>
            <div className="rail-word">SorarinBot<span>.</span></div>
            <div className="rail-sub">YOUR WECHAT, WITH A BRAIN.</div>
          </div>
        </div>
        <div className="rail-copy">
          <div className="rail-line" />
          <p>把 AI 放进</p>
          <p className="rail-copy-strong">你最熟悉的对话框。</p>
          <div className="rail-tags">
            <span>本地优先</span>
            <span>隐私</span>
            <span>可记忆</span>
          </div>
        </div>
        <div className="rail-foot">
          <span>WINDOWS 10 / 11</span>
          <span>INSTALLER 1.0.0</span>
        </div>
      </aside>

      <main className="main">
        <header className="titlebar" data-tauri-drag-region>
          <nav className="wizard" aria-label="安装进度">
            <div className="wizard-rail">
              <span style={{ width: (currentIndex / (STEPS.length - 1)) * 100 + "%" }} />
            </div>
            {STEPS.map((step, index) => (
              <div
                key={step.id}
                className={cn("wizard-step", index < currentIndex && "is-done", index === currentIndex && "is-active")}
                aria-current={index === currentIndex ? "step" : undefined}
              >
                <span className="wizard-node">
                  {index < currentIndex ? <Icon name="check" /> : String(index + 1).padStart(2, "0")}
                </span>
                <span className="wizard-label">{step.label}</span>
              </div>
            ))}
          </nav>
          <div className="window-actions">
            <button type="button" className="icon-btn" aria-label="切换主题" onClick={() => setDark((value) => !value)}>
              <Icon name={dark ? "moon" : "sun"} />
            </button>
            <button type="button" className="icon-btn" aria-label="最小化" onClick={() => minimizeWindow()}>
              <Icon name="minus" />
            </button>
            <button type="button" className="icon-btn icon-btn-close" aria-label="关闭" onClick={() => handleClose()}>
              <Icon name="close" />
            </button>
          </div>
          <div className="flow-progress" aria-hidden="true">
            <span style={{ width: ((currentIndex + 1) / STEPS.length) * 100 + "%" }} />
          </div>
        </header>

        <div className={cn("page", "page-" + page)}>
          {page === "welcome" && (
            <>
              <div className="eyebrow"><span className="eyebrow-line" />SORARINBOT INSTALLER</div>
              <div className="welcome-head">
                <div>
                  <h1>让微信替你思考<span className="dot">。</span></h1>
                  <p className="lede">把 AI 装进最熟悉的聊天窗口。多模型、长期记忆、本地数据，一次安装，即刻拥有。</p>
                </div>
                <div className="version-pill"><span className="live-dot" />v{manifest.version}<em>最新稳定版</em></div>
              </div>
              <div className="feature-grid">
                {features.slice(0, 3).map((feature, index) => (
                  <article className="feature-card" key={feature.title}>
                    <div className="feature-icon"><Icon name={["layers", "shield", "spark"][index] || "spark"} /></div>
                    <span className="feature-index">{String(index + 1).padStart(2, "0")}</span>
                    <h3>{feature.title}</h3>
                    <p>{feature.body}</p>
                  </article>
                ))}
              </div>
              <div className="welcome-actions">
                <button type="button" className="btn btn-primary" onClick={() => setPage("options")}>
                  开始安装 <Icon name="arrow" />
                </button>
                <span className="fine-print"><Icon name="shield" /> 无需管理员权限 · 下载约 {formatBytes(manifest.payload.size)}</span>
              </div>
              {manifestError && <div className="inline-warning">无法获取最新版本信息，将使用内置版本。</div>}
              <div className="page-foot">
                <span><Icon name="shield" /> SHA-256 校验，安装包来源可验证</span>
                <span>WINDOWS 10 / 11 · 64-BIT</span>
              </div>
            </>
          )}

          {page === "options" && (
            <>
              <div className="eyebrow"><span className="eyebrow-line" />OPTIONS</div>
              <div className="options-head">
                <div>
                  <h2>选择安装设置</h2>
                  <p className="lede">确认安装位置与数据迁移方式，然后开始安装。</p>
                </div>
                <div className="mini-pill"><Icon name="download" />即将安装 SorarinBot v{manifest.version}</div>
              </div>
              <div className="options-grid">
                <section className="panel">
                  <div className="panel-head">
                    <div className="panel-icon"><Icon name="folder" /></div>
                    <div><h3>安装位置</h3><p>应用将安装到当前 Windows 用户目录。</p></div>
                    <span className="badge badge-mint">推荐</span>
                  </div>
                  <label className="field-label" htmlFor="install-dir">安装文件夹<span>绝对路径 · 不需要管理员权限</span></label>
                  <div className="path-row">
                    <input id="install-dir" value={installDir} onChange={(event) => setInstallDir(event.target.value)} spellCheck={false} />
                    <button type="button" className="btn btn-ghost" onClick={handleBrowse}>浏览</button>
                  </div>
                  <div className="path-meta"><span><i className="dot-mint" />路径可用</span><span>需要 {formatBytes(manifest.payload.size)}</span></div>
                  <div className="switch-row">
                    <div className="panel-icon panel-icon-sm"><Icon name="external" /></div>
                    <div><h4>创建桌面快捷方式</h4><p>安装完成后，可直接从桌面打开 SorarinBot。</p></div>
                    <Toggle checked={desktopShortcut} onChange={setDesktopShortcut} label="创建桌面快捷方式" />
                  </div>
                  <div className="hint-strip"><Icon name="shield" />仅安装到当前用户，不写入系统目录，也不会修改系统环境变量。</div>
                </section>

                <section className="panel panel-import">
                  <div className="panel-head">
                    <div className="panel-icon panel-icon-gold"><Icon name="download" /></div>
                    <div><h3>导入旧 zip 数据</h3><p>从旧版恢复配置与聊天记录。</p></div>
                    <span className="badge badge-gold">可选</span>
                  </div>
                  <div className={"dropzone" + (importSource ? " has-file" : "")} onClick={handlePickSource} role="button" tabIndex={0}>
                    <div className="dropzone-icon"><Icon name={importSource ? "check" : "folder"} /></div>
                    {importSource ? (
                      <>
                        <strong>已选择旧数据目录</strong>
                        <span className="mono-path">{importSource}</span>
                        <em>点击可重新选择</em>
                      </>
                    ) : (
                      <>
                        <strong>选择或拖入旧 zip 数据包</strong>
                        <span>保留 config.yaml、data.db 和 token.json</span>
                        <em>支持选择解压后的文件夹</em>
                      </>
                    )}
                  </div>
                  <p className="import-note">导入前会先备份同名文件，失败时自动回滚。</p>
                </section>
              </div>

              <details className="license">
                <summary><Icon name="shield" />许可协议与隐私说明<span className="badge badge-gold">必读</span><span className="license-more">查看</span></summary>
                <p>SorarinBot 基于 PolyForm Noncommercial License 1.0.0 发布，个人、教育、研究与公益用途可免费使用。商业用途需另行取得授权。</p>
              </details>

              {error && page === "options" && <div className="inline-error">{error}</div>}

              <div className="page-foot page-foot-actions">
                <span className="fine-print"><Icon name="shield" />开始前会校验安装包签名，所有操作均在本机完成</span>
                <div className="actions">
                  <button type="button" className="btn btn-ghost" onClick={() => setPage("welcome")}><Icon name="back" />上一步</button>
                  <button type="button" className="btn btn-primary" onClick={beginInstall}>下一步 <Icon name="arrow" /></button>
                </div>
              </div>
            </>
          )}

          {page === "progress" && (
            <>
              <div className="eyebrow"><span className="eyebrow-line" />INSTALLING</div>
              <div className="progress-head">
                <div>
                  <h2>{phase === "download" ? "正在下载安装包" : phase === "verify" ? "正在校验安装包" : phase === "install" ? "正在写入程序文件" : phase === "error" ? "安装未完成" : "安装完成"}</h2>
                  <p className="lede">{phase === "download" ? "下载完成后会自动校验并写入文件，请保持窗口开启。" : phase === "verify" ? "正在校验 SHA-256 与数字签名，请稍候。" : phase === "install" ? "正在解压运行时并注册应用，请不要关闭窗口。" : phase === "error" ? "可以返回修改选项，或重试当前步骤。" : "正在完成最后的配置。"}</p>
                </div>
                <div className="status-pill"><span className={phase === "error" ? "status-dot is-error" : "status-dot"} />{phase === "error" ? "需要处理" : phase === "download" ? "安全下载 · GitHub Releases" : phase === "install" ? "安装进行中" : "校验中"}</div>
              </div>

              <section className="progress-card">
                <div className="ring-wrap">
                  <svg viewBox="0 0 120 120" className="ring">
                    <circle cx="60" cy="60" r="52" className="ring-track" />
                    <circle cx="60" cy="60" r="52" className="ring-value" strokeDasharray={2 * Math.PI * 52} strokeDashoffset={2 * Math.PI * 52 * (1 - percent / 100)} />
                  </svg>
                  <div className="ring-label"><strong>{percent}<span>%</span></strong><em>{ringLabel}</em></div>
                </div>
                <div className="progress-detail">
                  <div className="detail-top">
                    <div><span className="detail-kicker">{detailKicker}</span><strong>{detailTitle}</strong><em>{detailSub}</em></div>
                    <span className="speed-pill"><Icon name={installing ? "folder" : verifying ? "shield" : "download"} />{installing ? "本地安装" : verifying ? "本地校验" : speed > 0 ? formatBytes(speed) + "/s" : "等待中"}</span>
                  </div>
                  <div className="bar"><span style={{ width: percent + "%" }} /></div>
                  <div className="progress-stats">
                    {installing ? (
                      <>
                        <div><span>已写入</span><strong>{formatBytes(manifest.payload.size)} <em>/ {formatBytes(manifest.payload.size)}</em></strong></div>
                        <div><span>安装位置</span><strong>本机</strong></div>
                        <div><span>阶段</span><strong>解压与注册</strong></div>
                      </>
                    ) : verifying ? (
                      <>
                        <div><span>文件大小</span><strong>{formatBytes(manifest.payload.size)}</strong></div>
                        <div><span>校验方式</span><strong>SHA-256</strong></div>
                        <div><span>来源</span><strong>GitHub Releases</strong></div>
                      </>
                    ) : (
                      <>
                        <div><span>已下载</span><strong>{formatBytes(received)} <em>/ {formatBytes(manifest.payload.size)}</em></strong></div>
                        <div><span>剩余时间</span><strong>{speed > 0 ? Math.max(1, Math.round((manifest.payload.size - received) / speed)) + " 秒" : "—"}</strong></div>
                        <div><span>镜像</span><strong>GitHub Releases</strong></div>
                      </>
                    )}
                  </div>
                </div>
              </section>

              <section className={"phase-card" + (phase === "error" ? " is-error" : "")}>
                <div className="phase-icon">{phase === "error" ? <Icon name="refresh" /> : phase === "install" ? <Icon name="folder" /> : <Icon name="download" />}</div>
                <div><span>安装阶段 · INSTALLATION PHASE</span><strong>{phaseLabel}</strong><em>{installDir}</em></div>
                <span className={"phase-badge" + (phase === "error" ? " is-error" : "")}>{phaseBadge}</span>
              </section>

              {error && <div className="inline-error">{error}</div>}

              <div className="page-foot page-foot-actions">
                {phase === "download" ? (
                  <button type="button" className="btn btn-ghost" onClick={handleCancel}><Icon name="close" />取消下载</button>
                ) : phase === "error" ? (
                  <button type="button" className="btn btn-ghost" onClick={() => setPage("options")}><Icon name="back" />返回选项</button>
                ) : <span />}
                <span className="fine-print"><Icon name="shield" />关闭窗口不会中断写入；下载完成后将自动继续</span>
              </div>
            </>
          )}

          {page === "finish" && (
            <>
              <div className="finish-wrap">
                <div className="eyebrow eyebrow-center"><span className="eyebrow-line" />SETUP COMPLETE</div>
                <div className="success-ring">
                  <span className="success-halo" />
                  <span className="success-check"><Icon name="check" /></span>
                </div>
                <h2 className="finish-title">安装完成</h2>
                <p className="finish-sub">SorarinBot v{manifest.version} 已就绪，现在可以让微信替你思考。</p>

                <section className="finish-card">
                  <div className="launch-row">
                    <div className="panel-icon panel-icon-sm"><Icon name="spark" /></div>
                    <div><h4>立即启动 SorarinBot</h4><p>完成后自动打开应用，重新进入微信登录。</p></div>
                    <Toggle checked={launchAfter} onChange={setLaunchAfter} label="立即启动 SorarinBot" />
                  </div>
                  <div className="finish-meta">
                    <div><span>版本</span><strong>v{manifest.version}</strong></div>
                    <div><span>安装位置</span><strong className="mono-path">{installDir}</strong></div>
                    <div><span>校验</span><strong className="verified"><Icon name="shield" />{signed ? "签名已验证" : "SHA-256 已校验"}</strong></div>
                  </div>
                </section>

                <div className="finish-actions">
                  <button type="button" className="btn btn-ghost" onClick={() => openPath(installDir)}><Icon name="folder" />打开安装目录</button>
                  <button type="button" className="btn btn-primary" onClick={handleFinish}>完成 <Icon name="arrow" /></button>
                </div>
              </div>
              <div className="page-foot">
                <span><Icon name="shield" />可在应用设置中重新安装或卸载，用户数据默认保留</span>
                <span>BUILD {manifest.version} · 64-BIT</span>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
