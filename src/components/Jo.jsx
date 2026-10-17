// Jo, Jovita's mascot: a marigold speech bubble with plum feet.
// Moods: hello (waves), think, paid (arms up), sleep, oops.
// The Ask Jovita chat icon (AskIcon) is a separate mark and stays as it is.

const BODY = "M82 34 H118 A48 48 0 0 1 166 82 V124 A48 48 0 0 1 118 172 H88 L60 194 L66 166 A48 48 0 0 1 34 124 V82 A48 48 0 0 1 82 34 Z";
const PLUM = "#261433";

function Face({ mood }) {
  if (mood === "paid") return (<>
    <path d="M70 86 Q78 76 86 86" fill="none" stroke={PLUM} strokeWidth="7" strokeLinecap="round" />
    <path d="M114 86 Q122 76 130 86" fill="none" stroke={PLUM} strokeWidth="7" strokeLinecap="round" />
    <path d="M80 108 Q100 136 120 108 Z" fill={PLUM} />
  </>);
  if (mood === "sleep") return (<>
    <path d="M70 88 Q78 94 86 88" fill="none" stroke={PLUM} strokeWidth="6" strokeLinecap="round" />
    <path d="M114 88 Q122 94 130 88" fill="none" stroke={PLUM} strokeWidth="6" strokeLinecap="round" />
    <path d="M92 116 H108" stroke={PLUM} strokeWidth="6" strokeLinecap="round" />
    <text x="150" y="40" fontFamily="Bricolage Grotesque, sans-serif" fontWeight="800" fontSize="26" fill={PLUM}>z</text>
  </>);
  if (mood === "oops") return (<>
    <circle cx="78" cy="86" r="8" fill={PLUM} /><circle cx="122" cy="86" r="8" fill={PLUM} />
    <ellipse cx="100" cy="118" rx="9" ry="11" fill={PLUM} />
  </>);
  if (mood === "think") return (<>
    <circle cx="82" cy="82" r="8" fill={PLUM} /><circle cx="126" cy="82" r="8" fill={PLUM} />
    <path d="M90 116 Q104 110 116 116" fill="none" stroke={PLUM} strokeWidth="7" strokeLinecap="round" />
  </>);
  return (<>
    <circle cx="78" cy="86" r="8" fill={PLUM} /><circle cx="122" cy="86" r="8" fill={PLUM} />
    <path d="M122 102 V110 A22 22 0 0 1 78 110" fill="none" stroke={PLUM} strokeWidth="8" strokeLinecap="round" />
  </>);
}

function Arms({ mood }) {
  const s = { fill: "none", stroke: "#E89A00", strokeWidth: 12, strokeLinecap: "round" };
  if (mood === "paid") return (<><path d="M40 104 Q14 78 22 52" {...s} /><path d="M160 104 Q186 78 178 52" {...s} /></>);
  if (mood === "hello") return (<><path d="M40 110 Q22 104 20 84" {...s} /><path d="M160 104 Q186 78 178 52" {...s} /></>);
  if (mood === "think") return (<><path d="M40 112 Q24 116 22 130" {...s} /><path d="M160 120 Q150 140 128 134" {...s} /></>);
  return (<><path d="M40 112 Q24 118 24 134" {...s} /><path d="M160 112 Q176 118 176 134" {...s} /></>);
}

export default function Jo({ mood = "hello", size = 120, className = "", title }) {
  const anim = mood === "paid" ? "hop" : mood === "sleep" ? "" : "bob";
  return (
    <svg className={`jo ${anim} ${className}`} viewBox="0 0 200 220" width={size} height={size * 1.1}
      role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <Arms mood={mood} />
      <path d={BODY} fill="#FFB320" />
      <rect x="76" y="176" width="18" height="24" rx="9" fill={PLUM} />
      <rect x="110" y="176" width="18" height="24" rx="9" fill={PLUM} />
      <circle cx="64" cy="110" r="8" fill="#F7A6C0" /><circle cx="136" cy="110" r="8" fill="#F7A6C0" />
      <Face mood={mood} />
    </svg>
  );
}

// The Ask Jovita chat icon ("Typing to Smile"): three dots while thinking, a smile when it answers.
export function AskIcon({ state = "typing", className = "bubble" }) {
  return (
    <svg className={className} viewBox="0 0 120 120" aria-hidden="true">
      <path d="M30 10 H90 A20 20 0 0 1 110 30 V78 A20 20 0 0 1 90 98 H46 L22 113 L27 96 A20 20 0 0 1 10 78 V30 A20 20 0 0 1 30 10 Z" fill="#FFB320" />
      {state === "typing" ? (<>
        <circle cx="38" cy="54" r="7" fill={PLUM} /><circle cx="60" cy="54" r="7" fill={PLUM} /><circle cx="82" cy="54" r="7" fill={PLUM} />
      </>) : (<>
        <circle cx="44" cy="44" r="7" fill={PLUM} />
        <path d="M68 46 Q76 38 84 46" fill="none" stroke={PLUM} strokeWidth="5" strokeLinecap="round" />
        <path d="M76 58 V64 A16 16 0 0 1 44 64" fill="none" stroke={PLUM} strokeWidth="8" strokeLinecap="round" />
      </>)}
    </svg>
  );
}
