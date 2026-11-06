/// <reference types="vite/client" />

interface Window {
  sorarinbot?: {
    platform: string;
    setTitleBarTheme?: (theme: "light" | "dark") => void;
  };
}
