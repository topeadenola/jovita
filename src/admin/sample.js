// Preview data so the dashboard can be judged before there are many real studios.
// Clearly labelled "Sample data" in the UI and never written to the database.
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const NAMES = ["SmithLine Photography", "Lagos Light Studio", "Ama Mensah Bridal", "Glow by Kemi", "Frames & Co", "Accra Reels", "North Star Films", "Bloom Makeup", "Kudi Creative", "Evore Atelier", "Nairobi Lens", "Peach & Pine", "Brightside Weddings", "Studio Ola", "Velvet Brush", "Harbour Films", "Ijeoma Styles", "Atlanta Shoots", "Marigold Moments", "Kente Collective"];
const FIRST = ["Tope", "Ama", "Kemi", "Tunde", "Chloe", "Marcus", "Priya", "Ijeoma", "Kwame", "Zainab", "Femi", "Grace", "Daniel", "Aisha", "Sade"];
const CAREERS = ["Photographer", "Videographer", "Makeup artist", "Content creator", "Designer", "Stylist"];
const COUNTRIES = [["NG", "NGN", 0.52], ["GB", "GBP", 0.16], ["GH", "NGN", 0.09], ["US", "USD", 0.1], ["KE", "USD", 0.05], ["CI", "XOF", 0.05], ["FR", "EUR", 0.03]];

export function sampleStudios(n = 1186) {
  seed = 11;
  const now = Date.now(); const rows = [];
  for (let i = 0; i < n; i++) {
    // Growth curve: more signups recently
    const age = Math.pow(rnd(), 1.9) * 420;
    let r = rnd(), c = COUNTRIES[0]; for (const x of COUNTRIES) { if (r < x[2]) { c = x; break; } r -= x[2]; }
    const plan = rnd() < 0.71 ? "free" : rnd() < 0.78 ? "pro" : "studio";
    const name = i < NAMES.length ? NAMES[i] : `${pick(FIRST)} ${pick(["Studio", "Films", "Photography", "Beauty", "Creative", "Media"])}`;
    const first = pick(FIRST);
    rows.push({
      id: "s" + i, name, owner_first_name: first, email: `${first.toLowerCase()}${i}@example.com`, plan, plan_status: rnd() < 0.04 && plan !== "free" ? "past_due" : "active",
      suspended: rnd() < 0.006, home_currency: c[1], country: c[0], language: c[0] === "CI" || c[0] === "FR" ? "fr" : "en",
      careers: [pick(CAREERS)].concat(rnd() < 0.3 ? [pick(CAREERS)] : []), onboarded: rnd() < 0.86,
      created_at: new Date(now - age * 864e5).toISOString(), last_sign_in_at: new Date(now - Math.pow(rnd(), 2.5) * 60 * 864e5).toISOString(),
      clients: Math.floor(rnd() * 140), projects: Math.floor(rnd() * 60), invoices: Math.floor(rnd() * 90), galleries: Math.floor(rnd() * 30),
      processed: { [c[1]]: Math.round(rnd() * rnd() * (c[1] === "NGN" ? 18e6 : c[1] === "XOF" ? 4e6 : 9000)) }, admin_note: "",
    });
  }
  return rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

const PRICES = { NGN: { pro: 19500, studio: 39000 }, GBP: { pro: 15, studio: 32 }, USD: { pro: 19, studio: 39 }, EUR: { pro: 18, studio: 36 }, XOF: { pro: 11500, studio: 23000 } };

export function sampleOverview(days = 30) {
  const all = sampleStudios();
  const now = Date.now(); const since = days ? now - days * 864e5 : 0; const prev = days ? now - 2 * days * 864e5 : 0;
  const t = (s) => new Date(s.created_at).getTime();
  const count = (f) => all.filter(f).length;
  const sumBy = (rows, f) => rows.reduce((m, s) => { const [k, v] = f(s); if (v) m[k] = (m[k] || 0) + v; return m; }, {});
  const paying = all.filter((s) => s.plan !== "free" && s.plan_status === "active");
  const nDays = days || 420; const daily = [];
  seed = 3;
  for (let i = nDays - 1; i >= 0; i--) {
    const d = new Date(now - i * 864e5); const key = d.toISOString().slice(0, 10);
    const signups = all.filter((s) => s.created_at.slice(0, 10) === key).length;
    daily.push({ d: key, signups, upgrades: Math.round(signups * (0.12 + rnd() * 0.1)), active: Math.round(80 + (nDays - i) * (days ? 9 / Math.max(1, days / 30) : 1.4) + rnd() * 40) });
  }
  const tally = (key) => { const m = {}; all.forEach((s) => [].concat(s[key]).forEach((k) => { m[k] = (m[k] || 0) + 1; })); return Object.entries(m).map(([k, n]) => ({ k, n })).sort((a, b) => b.n - a.n); };
  const recentKinds = ["signup", "upgrade", "invoice_paid", "gallery_published", "onboarded", "client_added", "invoice_sent", "downgrade"];
  seed = 5;
  const recent = Array.from({ length: 12 }, (_, i) => { const s = all[Math.floor(rnd() * 60)]; const kind = i === 0 ? "upgrade" : pick(recentKinds); return { kind, at: new Date(now - i * (8 + rnd() * 40) * 6e4).toISOString(), studio: s.name, studio_id: s.id, meta: kind === "upgrade" ? { from: "free", to: "pro" } : kind === "invoice_paid" ? { amount: 450000, currency: "NGN" } : kind === "downgrade" ? { from: "studio", to: "pro" } : {} }; });
  const inRange = all.filter((s) => t(s) >= since);
  return {
    sample: true, now: new Date().toISOString(),
    studios: all.length, studios_prev: count((s) => t(s) < since),
    signups: inRange.length, signups_prev: count((s) => t(s) >= prev && t(s) < since),
    active: count((s) => now - new Date(s.last_sign_in_at) < 30 * 864e5), active7: count((s) => now - new Date(s.last_sign_in_at) < 7 * 864e5),
    onboarded: count((s) => s.onboarded), suspended: count((s) => s.suspended),
    plans: { free: count((s) => s.plan === "free"), pro: count((s) => s.plan === "pro"), studio: count((s) => s.plan === "studio") },
    paying: paying.length, paying_prev: paying.filter((s) => t(s) < since).length,
    mrr: sumBy(paying, (s) => [s.home_currency, PRICES[s.home_currency][s.plan]]),
    billing: {}, billing_count: 0,
    processed: { NGN: 284_600_000 * (days ? days / 30 : 9), GBP: 41_200 * (days ? days / 30 : 9), USD: 18_900 * (days ? days / 30 : 9), XOF: 6_400_000 * (days ? days / 30 : 9) },
    processed_prev: { NGN: 241_000_000 * (days ? days / 30 : 9), GBP: 37_800 * (days ? days / 30 : 9), USD: 16_100 * (days ? days / 30 : 9) },
    invoices_sent: Math.round(inRange.length * 6.4 + 2100 * (days ? days / 30 : 9)), galleries: 8460, clients: 41230, projects: 15210,
    daily, countries: tally("country").slice(0, 8), careers: tally("careers").slice(0, 6), languages: tally("language"),
    funnel: [inRange.length, Math.round(inRange.length * 0.86), Math.round(inRange.length * 0.64), Math.round(inRange.length * 0.41), Math.round(inRange.length * 0.27), Math.round(inRange.length * 0.12)],
    next_milestone: { goal: 2500, metric: "studios" }, recent,
  };
}

export function sampleNotifications() {
  const now = Date.now();
  return [
    { id: 9, kind: "milestone", title: "1,000 studios!", body: "A new Jovita milestone. Time to celebrate.", read: false, created_at: new Date(now - 4 * 6e4).toISOString() },
    { id: 8, kind: "upgrade", title: "Upgrade", body: "Lagos Light Studio: free → pro", read: false, created_at: new Date(now - 18 * 6e4).toISOString() },
    { id: 7, kind: "signup", title: "New studio signed up", body: "Bloom Makeup · grace41@example.com", read: false, created_at: new Date(now - 52 * 6e4).toISOString() },
    { id: 6, kind: "payment_failed", title: "Subscription payment failed", body: "North Star Films", read: true, created_at: new Date(now - 3 * 36e5).toISOString() },
    { id: 5, kind: "downgrade", title: "Downgrade", body: "Harbour Films: studio → pro", read: true, created_at: new Date(now - 9 * 36e5).toISOString() },
    { id: 4, kind: "signup", title: "New studio signed up", body: "Kente Collective · kwame19@example.com", read: true, created_at: new Date(now - 26 * 36e5).toISOString() },
  ];
}

export function sampleAiUsage(days = 30) {
  seed = 11;
  const nDays = days || 120; const daily = [];
  for (let i = nDays - 1; i >= 0; i--) daily.push({ day: new Date(Date.now() - i * 864e5).toISOString().slice(0, 10), questions: Math.round(260 + (nDays - i) * 4 + rnd() * 140) });
  const questions = daily.reduce((s, r) => s + r.questions, 0);
  const smart = Math.round(questions * 0.08);
  const studios = sampleStudios().slice(0, 12);
  return {
    questions, studios: Math.round(Math.min(1186, 140 + questions / 60)), actions: Math.round(questions * 0.34),
    input_tokens: questions * 3100, output_tokens: questions * 260,
    by_model: { "claude-haiku-5-5": { n: questions - smart, in: (questions - smart) * 3000, out: (questions - smart) * 240 }, "claude-sonnet-5-5": { n: smart, in: smart * 4300, out: smart * 500 } },
    by_plan: { free: Math.round(questions * 0.31), pro: Math.round(questions * 0.49), studio: Math.round(questions * 0.2) },
    daily, top: studios.slice(0, 6).map((s, i) => ({ studio_id: s.id, name: s.name, plan: s.plan, questions: Math.round(420 / (i + 1) + rnd() * 40) })).sort((a, b) => b.questions - a.questions),
  };
}
