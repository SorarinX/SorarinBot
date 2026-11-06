import { Link } from "react-router-dom";
import { SettingsIcon } from "./icons";

export function Topbar() {
  return (
    <header className="app-topbar glass-bg sticky top-0 z-20 shrink-0 border-b border-border" data-window-drag>
      <div className="app-gutter">
        <div className="app-topbar-inner mx-auto flex h-14 w-full max-w-[1280px] items-center justify-end gap-2.5">
          <Link
            to="/settings"
            aria-label="打开设置"
            title="设置"
            className="grid size-9 place-items-center rounded-full border border-border bg-surface text-muted transition-colors duration-[var(--dur-hover)] ease-[var(--ease-out)] hover:border-border-strong hover:bg-surface-2 hover:text-text"
          >
            <SettingsIcon className="size-4" />
          </Link>
        </div>
      </div>
    </header>
  );
}
