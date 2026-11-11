import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/base.css";
import "./styles/jobs.css";
import "./styles/setup.css";
import { initTheme } from "./theme.ts";
import { App } from "./App.tsx";

initTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
