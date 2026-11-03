import { NavLink, useNavigate } from "react-router-dom";
import { BotIcon, LogoutIcon, MoonIcon, SunIcon } from "./icons";
import { NAV_ITEMS } from "../lib/navigation";
import { cn } from "../lib/cn";
import { useTheme } from "../lib/theme";
import { useAuth } from "../lib/useAuth";

export function Sidebar() {
  const { theme, toggleTheme } = useTheme();
  const { required, logout } = useAuth();
  const navigate = useNavigate();
  const isDark = theme === "dark";

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <aside className="app-sidebar sidebar-glass fixed inset-y-0 left-0 z-30 flex w-[232px] flex-col border-r border-border">
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-border px-4">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand text-white">
          <BotIcon className="size-[18px]" />
        </span>
        <span className="truncate text-[14px] font-semibold tracking-tight text-text">
          SorarinBot
        </span>
      </div>

      <nav className="flex-1 space-y-1 px-2.5 py-3" aria-label="主导航">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "group flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13px] transition-colors duration-[var(--dur-hover)] ease-[var(--ease-out)]",
                  isActive
                    ? "bg-brand/[0.12] font-medium text-brand"
                    : "text-muted hover:bg-surface-2 hover:text-text dark:hover:bg-white/[0.06]",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={cn(
                      "size-4 shrink-0 transition-colors duration-[var(--dur-hover)]",
                      isActive ? "text-brand" : "text-muted group-hover:text-text",
                    )}
                  />
                  <span className="truncate">{item.label}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="border-t border-border p-2.5">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={isDark ? "切换到浅色模式" : "切换到深色模式"}
            className="flex h-9 min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2.5 text-[13px] text-muted transition-colors duration-[var(--dur-hover)] ease-[var(--ease-out)] hover:bg-surface-2 hover:text-text dark:hover:bg-white/[0.06]"
          >
            {isDark ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
            <span className="truncate">{isDark ? "浅色模式" : "深色模式"}</span>
            <span className="ml-auto text-[11px] text-muted/80">
              {isDark ? "Dark" : "Light"}
            </span>
          </button>

          {required ? (
            <button
              type="button"
              onClick={() => void handleLogout()}
              aria-label="退出登录"
              title="退出登录"
              className="grid size-9 shrink-0 place-items-center rounded-lg border border-transparent text-muted transition-colors duration-[var(--dur-hover)] ease-[var(--ease-out)] hover:border-border hover:bg-surface-2 hover:text-text dark:hover:bg-white/[0.06]"
            >
              <LogoutIcon className="size-4" />
            </button>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
