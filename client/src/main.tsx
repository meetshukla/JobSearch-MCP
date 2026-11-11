import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/shell.css";
import "./styles/list.css";
import "./styles/detail.css";
import "./styles/overlays.css";
import "./styles/settings.css";
import "./styles/gate.css";
import { initTheme } from "./theme.ts";
import { App } from "./App.tsx";

initTheme();

// Overlays drop their transitions when the keyboard opened them, because keyboard actions are too frequent to animate.
const root = document.documentElement;
addEventListener("keydown", () => (root.dataset.input = "keyboard"), true);
addEventListener("pointerdown", () => (root.dataset.input = "pointer"), true);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
