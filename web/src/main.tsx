import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@fontsource-variable/inter";
import "@fontsource-variable/sora";
import App from "./App";
import { ThemeProvider } from "./lib/theme";
import "./styles/global.css";

const basename = import.meta.env.BASE_URL.replace(/\/$/, "");

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
