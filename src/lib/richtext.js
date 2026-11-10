// Formatted text for Spotlight stories: headings, bold, lists, quotes, links, tables, pictures and picture strips.
// Everything is cleaned against a fixed list of allowed tags and attributes, both when it is pasted or saved
// and again when it is shown, so nothing unsafe (scripts, styles, event handlers, odd links) can get through.

const ALLOWED = new Set(["P", "BR", "H2", "H3", "H4", "STRONG", "EM", "U", "S", "A", "UL", "OL", "LI", "BLOCKQUOTE", "TABLE", "THEAD", "TBODY", "TFOOT", "TR", "TH", "TD", "FIGURE", "FIGCAPTION", "IMG", "DIV", "HR"]);
const RENAME = { H1: "H2", H5: "H4", H6: "H4", B: "STRONG", I: "EM", STRIKE: "S", DEL: "S" };
// Removed together with everything inside them
const DROP = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "LINK", "META", "TITLE", "HEAD", "NOSCRIPT", "SVG", "MATH", "FORM", "INPUT", "BUTTON", "SELECT", "TEXTAREA", "VIDEO", "AUDIO", "CANVAS", "TEMPLATE", "COLGROUP", "COL", "CAPTION"]);

export const isHtml = (body) => /^\s*<[a-z]/i.test(body || "");
const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Older stories were plain text: a blank line starts a paragraph, "## " a heading, "> " a quote
export function legacyToHtml(text = "") {
  const out = [];
  text.split(/\n\s*\n/).forEach((block) => {
    let para = [];
    const flush = () => { if (para.length) { out.push(`<p>${esc(para.join(" "))}</p>`); para = []; } };
    block.split("\n").forEach((ln) => {
      if (ln.startsWith("## ")) { flush(); out.push(`<h2>${esc(ln.slice(3))}</h2>`); }
      else if (ln.startsWith("> ")) { flush(); out.push(`<blockquote>${esc(ln.slice(2))}</blockquote>`); }
      else if (ln.trim()) para.push(ln.trim());
    });
    flush();
  });
  return out.join("");
}

const safeHref = (h) => { const v = String(h || "").trim(); return /^(https?:\/\/|mailto:)/i.test(v) ? v : /^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(v) ? "https://" + v : ""; };

// imgOk(src) says whether a picture address is one of ours (pictures from other sites are dropped)
export function cleanHtml(html, imgOk = () => false) {
  const doc = new DOMParser().parseFromString(`<body>${html || ""}</body>`, "text/html");
  const walk = (node) => {
    [...node.childNodes].forEach((n) => {
      if (n.nodeType === 3) return;
      if (n.nodeType !== 1) { n.remove(); return; }
      let tag = n.tagName;
      if (DROP.has(tag)) { n.remove(); return; }
      const style = (n.getAttribute("style") || "").toLowerCase();
      // Word and Google Docs mark bold and italic with styles
      const bold = /font-weight:\s*(bold|[6-9]00)/.test(style), plain = /font-weight:\s*(normal|400)/.test(style), ital = /font-style:\s*italic/.test(style);
      if ((tag === "B" || tag === "STRONG") && plain) tag = "SPAN";
      else if (tag === "SPAN" && bold) tag = "B";
      else if (tag === "SPAN" && ital) tag = "I";
      tag = RENAME[tag] || tag;
      walk(n);
      if (!ALLOWED.has(tag)) { n.replaceWith(...n.childNodes); return; }
      let el = n;
      if (tag !== n.tagName) { el = doc.createElement(tag); el.append(...n.childNodes); n.replaceWith(el); }
      const keep = {};
      if (tag === "A") { const h = safeHref(n.getAttribute("href")); if (!h) { el.replaceWith(...el.childNodes); return; } keep.href = h; keep.target = "_blank"; keep.rel = "noopener noreferrer nofollow"; }
      if (tag === "IMG") { const s = n.getAttribute("src") || ""; if (!imgOk(s)) { el.remove(); return; } keep.src = s; keep.alt = (n.getAttribute("alt") || "").slice(0, 200); keep.loading = "lazy"; }
      if (tag === "TD" || tag === "TH") ["colspan", "rowspan"].forEach((a) => { const v = parseInt(n.getAttribute(a), 10); if (v > 1 && v < 50) keep[a] = String(v); });
      if (tag === "FIGURE") keep.class = "sp-fig";
      if (tag === "DIV") { if (!/\bsp-strip\b/.test(n.getAttribute("class") || "")) { el.replaceWith(...el.childNodes); return; } keep.class = "sp-strip"; }
      [...el.attributes].forEach((a) => el.removeAttribute(a.name));
      Object.entries(keep).forEach(([k, v]) => el.setAttribute(k, v));
      // Tidy: a picture block with no picture left, or an empty caption, goes
      if ((tag === "FIGURE" || tag === "DIV") && !el.querySelector("img")) el.remove();
      else if (tag === "FIGCAPTION" && !el.textContent.trim()) el.remove();
    });
  };
  walk(doc.body);
  return doc.body.innerHTML.trim();
}

export const textOf = (html) => new DOMParser().parseFromString(html || "", "text/html").body.textContent || "";
