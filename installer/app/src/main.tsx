import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "misans/lib/Normal/MiSansVF.min.css";
import "./styles/tokens.css";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
