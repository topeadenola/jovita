import { C } from "../lib/theme";
import Svg, { Circle, Path, Rect } from "react-native-svg";

const P = {
  today: [<Circle key="a" cx="12" cy="12" r="4" />, <Path key="b" d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />],
  inbox: [<Path key="a" d="M22 12h-6l-2 3h-4l-2-3H2" />, <Path key="b" d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />],
  users: [<Path key="a" d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />, <Circle key="b" cx="9" cy="7" r="4" />, <Path key="c" d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />],
  folder: [<Path key="a" d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />],
  calendar: [<Rect key="a" x="3" y="4" width="18" height="18" rx="2" />, <Path key="b" d="M16 2v4M8 2v4M3 10h18" />],
  wallet: [<Path key="a" d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />, <Path key="b" d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />],
  image: [<Rect key="a" x="3" y="3" width="18" height="18" rx="2" />, <Circle key="b" cx="9" cy="9" r="2" />, <Path key="c" d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21" />],
  settings: [<Path key="a" d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />],
  plus: [<Path key="a" d="M12 5v14M5 12h14" />],
  search: [<Circle key="a" cx="11" cy="11" r="8" />, <Path key="b" d="m21 21-4.3-4.3" />],
  link: [<Path key="a" d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />, <Path key="b" d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />],
  send: [<Path key="a" d="m22 2-7 20-4-9-9-4Z" />, <Path key="b" d="M22 2 11 13" />],
  check: [<Path key="a" d="M20 6 9 17l-5-5" />],
  star: [<Path key="a" d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" />],
  x: [<Path key="a" d="M18 6 6 18M6 6l12 12" />],
  file: [<Path key="a" d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />, <Path key="b" d="M14 2v4a2 2 0 0 0 2 2h4M10 9H8M16 13H8M16 17H8" />],
  chat: [<Path key="a" d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />],
  clock: [<Circle key="a" cx="12" cy="12" r="10" />, <Path key="b" d="M12 6v6l4 2" />],
  chevron: [<Path key="a" d="m9 18 6-6-6-6" />],
  back: [<Path key="a" d="m15 18-6-6 6-6" />],
  moon: [<Path key="a" d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />],
  phone: [<Path key="a" d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />],
  mail: [<Rect key="a" x="2" y="4" width="20" height="16" rx="2" />, <Path key="b" d="m22 7-10 5L2 7" />],
  share: [<Path key="a" d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13" />],
  eye: [<Path key="a" d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />, <Circle key="b" cx="12" cy="12" r="3" />],
  logout: [<Path key="a" d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />, <Path key="b" d="m16 17 5-5-5-5M21 12H9" />],
  more: [<Circle key="a" cx="5" cy="12" r="1.5" />, <Circle key="b" cx="12" cy="12" r="1.5" />, <Circle key="c" cx="19" cy="12" r="1.5" />],
  chart: [<Path key="a" d="M3 3v16a2 2 0 0 0 2 2h16" />, <Path key="b" d="M7 16v-4M12 16V8M17 16v-7" />],
  receipt: [<Path key="a" d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />, <Path key="b" d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8M12 17.5v-11" />],
};

export default function Icon({ name, size = 22, color = C.ink, stroke = 1.9 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      {P[name]}
    </Svg>
  );
}

export function Mark({ size = 28, dot = C.ink, smile = "#FFB320" }) {
  return (
    <Svg width={size * (76 / 106)} height={size} viewBox="17 17 76 106">
      <Circle cx="32" cy="30" r="11" fill={dot} />
      <Circle cx="80" cy="30" r="11" fill={dot} />
      <Path d="M80 56 V86 A26 26 0 0 1 28 86" fill="none" stroke={smile} strokeWidth="18" strokeLinecap="round" />
    </Svg>
  );
}
