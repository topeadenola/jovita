import { createContext, useContext, useEffect, useState } from "react";
import { useColorScheme } from "react-native";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useData } from "../lib/data";
import { setScheme } from "../lib/theme";

// Bright, dark or automatic (follows the phone). Saved on the studio so it matches the web app.
const Ctx = createContext({ mode: "auto", dark: false, setMode: () => {} });
export const useTheme = () => useContext(Ctx);

export function ThemeProvider({ children }) {
  const { studio, updateStudio } = useData() || {};
  const system = useColorScheme();
  const [mode, setModeState] = useState(studio?.theme || "auto");
  useEffect(() => { if (studio?.theme) setModeState(studio.theme); }, [studio?.theme]);
  const dark = mode === "dark" || (mode === "auto" && system === "dark");
  // Switch colours before children render, so every screen draws in the right theme
  const [applied, setApplied] = useState(() => { setScheme(dark); return dark; });
  if (applied !== dark) { setScheme(dark); setApplied(dark); }

  // returnTo: the screen to reopen after everything re-draws in the new colours
  const setMode = (m, returnTo) => {
    setModeState(m);
    if (returnTo) setTimeout(() => { try { router.push(returnTo); } catch { /* not ready */ } }, 60);
    if (updateStudio && studio) updateStudio({ theme: m }).catch(() => {});
  };
  return (
    <Ctx.Provider value={{ mode, dark, setMode }}>
      <StatusBar style={dark ? "light" : "dark"} />
      {/* Re-draw everything from the top when the theme flips */}
      <Fragment key={dark ? "dark" : "light"}>{children}</Fragment>
    </Ctx.Provider>
  );
}

function Fragment({ children }) { return children; }
