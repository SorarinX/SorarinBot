import type { ComponentType } from "react";
import {
  ChatIcon,
  DashboardIcon,
  LogsIcon,
  SettingsIcon,
} from "../components/icons";

export type NavItem = {
  to: string;
  label: string;
  end?: boolean;
  icon: ComponentType<{ className?: string }>;
};

export const NAV_ITEMS: NavItem[] = [
  { to: "/dashboard", label: "仪表盘", end: true, icon: DashboardIcon },
  { to: "/chat", label: "会话", icon: ChatIcon },
  { to: "/logs", label: "日志", icon: LogsIcon },
  { to: "/settings", label: "设置", icon: SettingsIcon },
];

export const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "仪表盘",
  "/welcome": "欢迎",
  "/chat": "会话",
  "/logs": "日志",
  "/settings": "设置",
  "/settings/prompt": "提示词",
  "/login": "登录",
};

export function getPageTitle(pathname: string): string {
  const normalized =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;
  return PAGE_TITLES[normalized] ?? "控制台";
}
