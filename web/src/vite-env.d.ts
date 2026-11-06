/// <reference types="vite/client" />

interface Window {
  sorarinbot?: {
    platform: string;
    setTitleBarTheme?: (theme: "light" | "dark") => void;
    beginWindowDrag?: (x: number, y: number) => void;
    moveWindow?: (x: number, y: number) => void;
    endWindowDrag?: () => void;
  };
}
