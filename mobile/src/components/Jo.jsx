import { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";
import Svg, { Circle, Ellipse, Path, Rect } from "react-native-svg";

// Jo, Jovita's mascot. Moods: hello, think, paid, sleep, oops.
// The Ask Jovita chat icon (AskIcon) is separate and stays as it is.
const BODY = "M82 34 H118 A48 48 0 0 1 166 82 V124 A48 48 0 0 1 118 172 H88 L60 194 L66 166 A48 48 0 0 1 34 124 V82 A48 48 0 0 1 82 34 Z";
const P = "#261433";
const arm = { fill: "none", stroke: "#E89A00", strokeWidth: 12, strokeLinecap: "round" };

function Face({ mood }) {
  if (mood === "paid") return (<>
    <Path d="M70 86 Q78 76 86 86" fill="none" stroke={P} strokeWidth={7} strokeLinecap="round" />
    <Path d="M114 86 Q122 76 130 86" fill="none" stroke={P} strokeWidth={7} strokeLinecap="round" />
    <Path d="M80 108 Q100 136 120 108 Z" fill={P} />
  </>);
  if (mood === "sleep") return (<>
    <Path d="M70 88 Q78 94 86 88" fill="none" stroke={P} strokeWidth={6} strokeLinecap="round" />
    <Path d="M114 88 Q122 94 130 88" fill="none" stroke={P} strokeWidth={6} strokeLinecap="round" />
    <Path d="M92 116 H108" stroke={P} strokeWidth={6} strokeLinecap="round" />
  </>);
  if (mood === "oops") return (<>
    <Circle cx="78" cy="86" r="8" fill={P} /><Circle cx="122" cy="86" r="8" fill={P} />
    <Ellipse cx="100" cy="118" rx="9" ry="11" fill={P} />
  </>);
  if (mood === "think") return (<>
    <Circle cx="82" cy="82" r="8" fill={P} /><Circle cx="126" cy="82" r="8" fill={P} />
    <Path d="M90 116 Q104 110 116 116" fill="none" stroke={P} strokeWidth={7} strokeLinecap="round" />
  </>);
  return (<>
    <Circle cx="78" cy="86" r="8" fill={P} /><Circle cx="122" cy="86" r="8" fill={P} />
    <Path d="M122 102 V110 A22 22 0 0 1 78 110" fill="none" stroke={P} strokeWidth={8} strokeLinecap="round" />
  </>);
}

function Arms({ mood }) {
  if (mood === "paid") return (<><Path d="M40 104 Q14 78 22 52" {...arm} /><Path d="M160 104 Q186 78 178 52" {...arm} /></>);
  if (mood === "hello") return (<><Path d="M40 110 Q22 104 20 84" {...arm} /><Path d="M160 104 Q186 78 178 52" {...arm} /></>);
  if (mood === "think") return (<><Path d="M40 112 Q24 116 22 130" {...arm} /><Path d="M160 120 Q150 140 128 134" {...arm} /></>);
  return (<><Path d="M40 112 Q24 118 24 134" {...arm} /><Path d="M160 112 Q176 118 176 134" {...arm} /></>);
}

export default function Jo({ mood = "hello", size = 120 }) {
  const y = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (mood === "sleep") return undefined;
    const h = mood === "paid" ? -14 : -4;
    const d = mood === "paid" ? 700 : 1300;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(y, { toValue: h, duration: d, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(y, { toValue: 0, duration: d, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [mood, y]);
  return (
    <Animated.View style={{ transform: [{ translateY: y }] }} accessible={false}>
      <Svg width={size} height={size * 1.1} viewBox="0 0 200 220">
        <Arms mood={mood} />
        <Path d={BODY} fill="#FFB320" />
        <Rect x="76" y="176" width="18" height="24" rx="9" fill={P} />
        <Rect x="110" y="176" width="18" height="24" rx="9" fill={P} />
        <Circle cx="64" cy="110" r="8" fill="#F7A6C0" /><Circle cx="136" cy="110" r="8" fill="#F7A6C0" />
        <Face mood={mood} />
      </Svg>
    </Animated.View>
  );
}

// "Typing to Smile": three dots while thinking, a smile when it answers
export function AskIcon({ state = "typing", size = 40 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <Path d="M30 10 H90 A20 20 0 0 1 110 30 V78 A20 20 0 0 1 90 98 H46 L22 113 L27 96 A20 20 0 0 1 10 78 V30 A20 20 0 0 1 30 10 Z" fill="#FFB320" />
      {state === "typing" ? (<>
        <Circle cx="38" cy="54" r="7" fill={P} /><Circle cx="60" cy="54" r="7" fill={P} /><Circle cx="82" cy="54" r="7" fill={P} />
      </>) : (<>
        <Circle cx="44" cy="44" r="7" fill={P} />
        <Path d="M68 46 Q76 38 84 46" fill="none" stroke={P} strokeWidth={5} strokeLinecap="round" />
        <Path d="M76 58 V64 A16 16 0 0 1 44 64" fill="none" stroke={P} strokeWidth={8} strokeLinecap="round" />
      </>)}
    </Svg>
  );
}
