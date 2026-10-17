import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Icon, { Mark } from "../components/Icon";
import "../landing.css";
import { tx } from "../lib/i18n";
import { LangSwitch } from "../components/Lang";

const FEATURES = [
  ["today", "Today, at a glance", "Open Jovita and see what needs you: late invoices, new inquiries, unsigned contracts and this week's shoots."],
  ["link", "One link per client", "Your client signs, pays and sees their photos from one friendly page. No accounts, no app to download."],
  ["file", "Contracts and model releases", "Write them once in Templates. Every client gets their own copy with their name, date and fee filled in."],
  ["wallet", "Get paid in ₦, £ or $", "Invoices in naira, pounds or dollars, with bank transfer, Paystack and Stripe. Reminders are on by default."],
  ["calendar", "Bookings that make sense", "Session types, prices and your calendar in one place, linked to the project they belong to."],
  ["image", "Galleries that close the loop", "Deliver the gallery to the same client link, track favourites and offer prints before it expires."],
];

const ROLES = ["Photographers", "Videographers", "Makeup artists", "Stylists", "Designers"];

const STEPS = [
  ["Add a client", "Paste their name and number, or let them find you through your booking page."],
  ["Send one link", "They read the contract, sign with their name and pay the deposit, all on their phone."],
  ["Shoot, deliver, get paid", "Move the project along, deliver the gallery to the same link, and Jovita chases the balance for you."],
];

const PLANS = [
  { name: "Starter", price: "Free", note: "For your first clients", items: ["Up to 5 active projects", "Contracts and model releases", "Client portal", "Bank transfer payments"] },
  { name: "Pro", price: "[₦ / £ / $ per month]", note: "For busy creatives", items: ["Unlimited projects", "Paystack and Stripe payments", "Automatic reminders by email and WhatsApp", "Galleries with downloads"], featured: true },
  { name: "Studio", price: "[₦ / £ / $ per month]", note: "For teams", items: ["Everything in Pro", "Team members and roles", "Multiple brands", "Priority support"] },
];

function HeroArt() {
  const [photo, setPhoto] = useState(true);
  return (
    <div className="hero-art" aria-hidden="true">
      <span className="blob blob-lilac" />
      <span className="blob blob-plum" />
      <span className="blob blob-mari" />
      <span className="blob blob-ring" />
      <div className="circle">
        {photo ? (
          <img src="/hero.png" alt="" onError={() => setPhoto(false)} />
        ) : (
          <div className="circle-mark"><Mark dot="#261433" smile="#261433" /></div>
        )}
      </div>
      <div className="float card-paid">
        <span className="fc-icon fc-green"><Icon name="check" /></span>
        <div><b>{tx("Deposit paid")}</b><span>{tx("₦225,000 · Invoice #1031")}</span></div>
      </div>
      <div className="float card-signed">
        <span className="fc-icon fc-mari"><Icon name="file" /></span>
        <div><b>{tx("Contract signed")}</b><span>{tx("by Adaeze Okafor")}</span></div>
      </div>
      <div className="float card-shoot">
        <p className="fc-day">{tx("SAT")}<br /><b>24</b></p>
        <div><b>{tx("Maternity shoot")}</b><span>{tx("10:00 · Lekki Studio")}</span></div>
      </div>
      <div className="float card-smile"><Mark dot="#261433" /></div>
    </div>
  );
}

function useReveal() {
  const ref = useRef(null);
  useEffect(() => {
    const root = ref.current;
    if (!root || !("IntersectionObserver" in window)) return;
    const els = root.querySelectorAll(".reveal, .reveal-kids");
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { threshold: 0.15, rootMargin: "0px 0px -40px 0px" });
    els.forEach((el) => io.observe(el));
    root.classList.add("ready");
    return () => io.disconnect();
  }, []);
  return ref;
}

export default function Landing() {
  const [menu, setMenu] = useState(false);
  const ref = useReveal();
  return (
    <div className="lp" ref={ref}>
      <header className="lp-nav">
        <Link to="/" className="lp-brand"><Mark dot="#261433" /><b>jovita</b></Link>
        <nav className={`lp-links ${menu ? "open" : ""}`} aria-label={tx("Main")}>
          <a href="#features" onClick={() => setMenu(false)}>{tx("Features")}</a>
          <a href="#how" onClick={() => setMenu(false)}>{tx("How it works")}</a>
          <a href="#pricing" onClick={() => setMenu(false)}>{tx("Pricing")}</a>
          <Link to="/login" className="pill-outline only-mobile">{tx("Log in")}</Link>
        </nav>
        <div className="lp-cta">
          <LangSwitch compact />
          <Link to="/login" className="pill-outline">{tx("Log in")}</Link>
          <Link to="/signup" className="pill-solid">{tx("Start free")}</Link>
          <button type="button" className="lp-burger" aria-expanded={menu} aria-label={tx("Menu")} onClick={() => setMenu(!menu)}><span /><span /><span /></button>
        </div>
      </header>
      <section className="lp-hero">
        <div className="hero-copy">
          <p className="hero-kicker">{tx("The friendly studio manager")}</p>
          <h1>{tx("Run your creative business")}{" "}<span className="swoosh">{tx("with joy.")}</span></h1>
          <p className="hero-sub"><b>{tx("Clients, contracts, invoices and galleries")}</b>{" "}{tx(
              "in one place, with one link your clients actually enjoy using. Made for creatives in Lagos, Accra, London, New York and everywhere in between."
            )}</p>
          <div className="hero-btns">
            <Link to="/signup" className="pill-solid pill-lg">{tx("Start free")}</Link>
            <a href="#how" className="pill-outline pill-lg">{tx("How it works")}</a>
          </div>
          <p className="hero-small">{tx("Free to start. No card needed.")}</p>
        </div>
        <HeroArt />
      </section>
      <section className="lp-roles" aria-label={tx("Who it's for")}>
        <p>{tx("Built for")}</p>
        <ul className="reveal-kids">{ROLES.map((r) => <li key={r}>{tx(r)}</li>)}</ul>
      </section>
      <section className="lp-section" id="features">
        <p className="lp-eyebrow reveal">{tx("Everything in one place")}</p>
        <h2 className="reveal">{tx("Less admin. More")}{" "}<span className="swoosh">{tx("shooting.")}</span></h2>
        <div className="lp-features reveal-kids">
          {FEATURES.map(([icon, title, text], ix) => (
            <article className={`lp-feature tone-${ix % 3}`} key={title}>
              <span className="lp-ficon"><Icon name={icon} /></span>
              <h3>{tx(title)}</h3>
              <p>{tx(text)}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="lp-section lp-how" id="how">
        <p className="lp-eyebrow reveal">{tx("How it works")}</p>
        <h2 className="reveal">{tx("From inquiry to paid in three steps")}</h2>
        <ol className="lp-steps reveal-kids">
          {STEPS.map(([t, d], ix) => (
            <li key={t}><span className="step-n">{ix + 1}</span><h3>{tx(t)}</h3><p>{tx(d)}</p></li>
          ))}
        </ol>
        <div className="lp-portal reveal">
          <div className="portal-copy">
            <h3>{tx("Your client sees this")}</h3>
            <p>{tx(
              "A page with your studio's name on it. They sign, pay and message you without creating an account. You see every step in Jovita."
            )}</p>
            <Link to="/signup" className="pill-solid">{tx("Try it with a test client")}</Link>
          </div>
          <div className="portal-mock" aria-label={tx("Example client portal")}>
            <p className="pm-studio"><span>{tx("HW")}</span>{" "}{tx("HorploadWorks")}</p>
            <p className="pm-hi">{tx("Hi Adaeze, here's everything for your maternity shoot.")}</p>
            <div className="pm-row done"><Icon name="check" />{" "}{tx("Contract signed")}</div>
            <div className="pm-row now"><span className="pm-dot" />{" "}{tx("Pay deposit · ₦225,000")}</div>
            <div className="pm-row"><span className="pm-dot" />{" "}{tx("Gallery arrives after the shoot")}</div>
          </div>
        </div>
      </section>
      <section className="lp-section" id="pricing">
        <p className="lp-eyebrow reveal">{tx("Pricing")}</p>
        <h2 className="reveal">{tx("Start free. Grow when you're ready.")}</h2>
        <div className="lp-plans reveal-kids">
          {PLANS.map((p) => (
            <article className={`lp-plan ${p.featured ? "featured" : ""}`} key={p.name}>
              {p.featured && <span className="plan-tag">{tx("Most popular")}</span>}
              <h3>{tx(p.name)}</h3>
              <p className="plan-price">{tx(p.price)}</p>
              <p className="plan-note">{tx(p.note)}</p>
              <ul>{p.items.map((i) => <li key={i}><Icon name="check" />{tx(i)}</li>)}</ul>
              <Link to="/signup" className={p.featured ? "pill-solid" : "pill-outline"}>{tx("Start free")}</Link>
            </article>
          ))}
        </div>
        <p className="lp-fine">{tx("Prices shown in your currency: naira, pounds or dollars.")}</p>
      </section>
      <section className="lp-final reveal">
        <span className="blob blob-a" aria-hidden="true" /><span className="blob blob-b" aria-hidden="true" />
        <h2>{tx("Your next client deserves a better experience.")}</h2>
        <p>{tx(
          "Set up your studio in five minutes. Bring your contracts, your prices and your style."
        )}</p>
        <Link to="/signup" className="pill-dark pill-lg">{tx("Create my studio")}</Link>
      </section>
      <footer className="lp-foot">
        <div className="lp-brand"><Mark dot="#FBF8FF" /><b>{tx("jovita")}</b></div>
        <p>{tx("Run your creative business with joy.")}</p>
        <nav aria-label={tx("Footer")}><a href="#features">{tx("Features")}</a><a href="#pricing">{tx("Pricing")}</a><Link to="/login">{tx("Log in")}</Link></nav>
        <p className="lp-copy">© {new Date().getFullYear()}{" "}{tx("Jovita")}</p>
      </footer>
    </div>
  );
}
