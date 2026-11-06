import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@fontsource-variable/inter";
import "@fontsource-variable/sora";
import App from "./App";
import { ThemeProvider } from "./lib/theme";
import "./styles/global.css";

const basename = import.meta.env.BASE_URL.replace(/\/$/, "");

if (window.sorarinbot) {
  document.documentElement.classList.add("is-electron");

  document.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (!target.closest("[data-window-drag]")) return;
    if (target.closest("a, button, input, textarea, select, [role='button']")) return;
    event.preventDefault();

    const startX = event.screenX;
    const startY = event.screenY;
    window.sorarinbot?.beginWindowDrag?.(startX, startY);

    const onMove = (moveEvent: PointerEvent) => {
      window.sorarinbot?.moveWindow?.(moveEvent.screenX, moveEvent.screenY);
    };
    const onEnd = () => {
      window.sorarinbot?.endWindowDrag?.();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
  });
}

const container = document.getElementById("root");

if (!container) {
  throw new Error("找不到 #root 挂载节点");
}

createRoot(container).render(
  <StrictMode>
    <ThemeProvider>
      <BrowserRouter basename={basename || undefined}>
        <App />
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
);
