import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ToastProvider } from "./components/ui";
import { LangProvider, initLang } from "./components/Lang";
import "./styles.css";
import { applyTheme, getSaved, watchSystem } from "./lib/theme";

// Jovita HQ lives at /admin/
if (location.pathname === "/admin") location.replace("/admin/");

initLang();
applyTheme(getSaved());
watchSystem();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <LangProvider>
          <App />
        </LangProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>
);
