// Jovita colours. C changes in place when the app switches between bright and dark,
// and the app re-renders from the top (see ThemeProvider in components/Theme.jsx).
const LIGHT = {
  marigold: "#FFB320", marigoldDeep: "#E89A00", marigoldText: "#8F5A00", onMarigold: "#261433",
  plum: "#261433", plumCard: "#261433", plumSoft: "#4B2E66", lilac: "#E9DDFB", lilac2: "#C9B2F2",
  paper: "#FBF8FF", white: "#FFFFFF", surface: "#FFFFFF", sunken: "#F3EDFB", tabBar: "#FFFFFF",
  ink: "#261433", muted: "#5E5069", line: "#E4DCEE", lineStrong: "#8C7F99",
  action: "#261433", onAction: "#FFFFFF",
  success: "#1F7A4D", successTint: "#E3F5EB", warning: "#8A5200", warningTint: "#FFF1D6",
  danger: "#B42F26", dangerTint: "#FCE6E3", info: "#2B54C4", infoTint: "#E5ECFF",
  toggleOn: "#261433", knobOn: "#FFB320",
};
const DARK = {
  ...LIGHT,
  marigoldText: "#FFC857", plumCard: "#4B2E66", lilac: "#3B2B52", lilac2: "#4B2E66",
  paper: "#17101F", white: "#21182B", surface: "#21182B", sunken: "#2A2035", tabBar: "#120C18",
  ink: "#F5EFFC", muted: "#B9AEC4", line: "#3A2E46", lineStrong: "#7D6F8C",
  action: "#FFB320", onAction: "#261433",
  success: "#5BD39A", successTint: "#163A29", warning: "#FFC857", warningTint: "#3D2E10",
  danger: "#FF8A7A", dangerTint: "#45201C", info: "#8EAAFF", infoTint: "#1D2747",
  toggleOn: "#FFB320", knobOn: "#261433",
};

export const C = { ...LIGHT };
export let isDark = false;

export const F = {
  display: "BricolageGrotesque_800ExtraBold",
  displayBold: "BricolageGrotesque_700Bold",
  displaySemi: "BricolageGrotesque_600SemiBold",
  body: "Figtree_400Regular",
  medium: "Figtree_500Medium",
  semi: "Figtree_600SemiBold",
  bold: "Figtree_700Bold",
};

// Pill classes from the web app, mapped to native colours
export const PILL = {};
const buildPills = () => Object.assign(PILL, {
  "p-neutral": [C.sunken, C.muted], "p-info": [C.infoTint, C.info], "p-success": [C.successTint, C.success],
  "p-warning": [C.warningTint, C.warning], "p-danger": [C.dangerTint, C.danger], "p-joy": [C.marigold, C.onMarigold],
});
buildPills();

const listeners = new Set();
export const onScheme = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export function setScheme(dark) {
  isDark = !!dark;
  Object.assign(C, dark ? DARK : LIGHT);
  buildPills();
  listeners.forEach((fn) => fn(isDark));
}
