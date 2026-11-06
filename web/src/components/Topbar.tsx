import { Link, useLocation } from "react-router-dom";
import { SettingsIcon } from "./icons";

const TITLES: Array<[string, string]> = [
  ["/settings/prompt", "系统提示词"],
  ["/settings", "设置"],
  ["/chat", "会话"],
  ["/logs", "日志"],
  ["/dashboard", "仪表盘"],
];

export function Topbar() {
  const { pathname } = useLocation();
  const title = TITLES.find(([path]) => pathname.startsWith(path))?.[1] ?? "控制台";

  return (
    <header className="app-topbar glass-bg sticky top-0 z-20 shrink-0 border-b border-border" data-window-drag>
      <div className="app-gutter">
        <div className="app-topbar-inner mx-auto flex h-14 w-full max-w-[1280px] items-center justify-between gap-3">
          <div className="app-topbar-context">
            <span>控制台</span>
            <span className="app-topbar-slash" aria-hidden="true">/</span>
            <strong>{title}</strong>
          </div>
          <Link
            to="/settings"
            aria-label="打开设置"
            title="设置"
            className="app-topbar-settings"
          >
            <SettingsIcon className="size-4" />
            <span>设置</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
