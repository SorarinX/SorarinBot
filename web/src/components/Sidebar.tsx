import { NavLink, useNavigate } from "react-router-dom";
import { LogoutIcon, MoonIcon, SunIcon } from "./icons";
import { NAV_ITEMS } from "../lib/navigation";
import { cn } from "../lib/cn";
import { useTheme } from "../lib/theme";
import { useAuth } from "../lib/useAuth";

const LOGO_SRC = import.meta.env.BASE_URL + "logo.png";

export function Sidebar() {
  const { theme, setTheme } = useTheme();
  const { required, logout } = useAuth();
  const navigate = useNavigate();
  const isDark = theme === "dark";

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <aside className="app-sidebar sidebar-glass fixed inset-y-0 left-0 z-30 flex w-[204px] flex-col border-r border-border">
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-border px-4">
        <img
          src={LOGO_SRC}
          alt=""
          className="size-8 shrink-0 object-contain"
        />
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
          <div
            role="group"
            aria-label="外观"
            className="flex h-9 min-w-0 flex-1 items-center gap-0.5 rounded-lg border border-border/70 bg-surface-2/80 p-0.5"
          >
            <button
              type="button"
              onClick={() => setTheme("light")}
              aria-pressed={!isDark}
              className={cn(
                "flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md px-1.5 text-[12px] font-medium transition-colors duration-[var(--dur-hover)] ease-[var(--ease-out)]",
                !isDark
                  ? "bg-brand/[0.12] text-brand-ink"
                  : "text-muted hover:bg-surface-solid/70 hover:text-text dark:hover:bg-white/[0.06]",
              )}
            >
              <SunIcon className="size-3.5 shrink-0" />
              <span className="truncate">浅色</span>
            </button>

            <button
              type="button"
              onClick={() => setTheme("dark")}
              aria-pressed={isDark}
              className={cn(
                "flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md px-1.5 text-[12px] font-medium transition-colors duration-[var(--dur-hover)] ease-[var(--ease-out)]",
                isDark
                  ? "bg-brand/[0.12] text-brand"
                  : "text-muted hover:bg-surface-solid/70 hover:text-text",
              )}
            >
              <MoonIcon className="size-3.5 shrink-0" />
              <span className="truncate">深色</span>
            </button>
          </div>

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
