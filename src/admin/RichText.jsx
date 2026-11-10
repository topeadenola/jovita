// The story editor in HQ › Spotlight: type or paste formatted text (headings, bold, lists, tables keep their format),
// and drop a picture or a strip of pictures anywhere in the story.
import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { cleanHtml, isHtml, legacyToHtml } from "../lib/richtext";

const escAttr = (t) => String(t).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
// In the editor, picture blocks are solid (click to select) and only the caption is typed into
const dress = (root) => {
  root.querySelectorAll("figure, .sp-strip").forEach((b) => b.setAttribute("contenteditable", "false"));
  root.querySelectorAll("figure").forEach((f) => { if (!f.querySelector("figcaption")) f.appendChild(document.createElement("figcaption")); });
  root.querySelectorAll("figcaption").forEach((c) => { c.setAttribute("contenteditable", "true"); c.setAttribute("data-ph", "Caption (optional)"); });
};

export default function RichText({ value, onChange, upload, imgOk, max = 200000 }) {
  const box = useRef(null);
  const pick = useRef(null);
  const range = useRef(null);
  const mode = useRef("one");
  const [sel, setSel] = useState(null); // the picture block that's selected
  const [busy, setBusy] = useState("");
  const [len, setLen] = useState(0);

  const emit = () => { const html = cleanHtml(box.current.innerHTML, imgOk); setLen(html.length); onChange(html); };
  useEffect(() => {
    box.current.innerHTML = cleanHtml(isHtml(value) ? value : legacyToHtml(value), imgOk);
    dress(box.current); setLen(box.current.innerHTML.length);
    try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch { /* older browsers */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const keep = () => { const s = window.getSelection(); if (s.rangeCount && box.current.contains(s.anchorNode)) range.current = s.getRangeAt(0).cloneRange(); };
  const back = () => { box.current.focus(); if (range.current) { const s = window.getSelection(); s.removeAllRanges(); s.addRange(range.current); } };
  const cmd = (name, arg) => { box.current.focus(); document.execCommand(name, false, arg); emit(); };
  const block = (tag) => cmd("formatBlock", `<${tag}>`);
  const insert = (html) => { back(); document.execCommand("insertHTML", false, html); dress(box.current); emit(); };

  // Pasting keeps the format (headings, bold, lists, tables) and drops anything unsafe
  const paste = (e) => {
    const html = e.clipboardData.getData("text/html");
    const text = e.clipboardData.getData("text/plain");
    e.preventDefault();
    let out;
    if (html) out = cleanHtml(html, imgOk);
    else if (/\t/.test(text) && /\n/.test(text.trim())) // rows and columns copied as plain text
      out = `<table><tbody>${text.trim().split(/\r?\n/).map((r) => `<tr>${r.split("\t").map((c) => `<td>${escAttr(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    else out = cleanHtml(legacyToHtml(text), imgOk);
    document.execCommand("insertHTML", false, out);
    dress(box.current); emit();
  };

  const link = () => {
    keep();
    const url = window.prompt("Link address (e.g. https://example.com)");
    if (!url) return;
    back(); document.execCommand("createLink", false, /^(https?:|mailto:)/i.test(url.trim()) ? url.trim() : "https://" + url.trim()); emit();
  };
  const choose = (m) => { keep(); mode.current = m; pick.current.multiple = m === "strip"; pick.current.click(); };
  const picked = async (e) => {
    const files = [...e.target.files]; e.target.value = ""; if (!files.length) return;
    setBusy(files.length > 1 ? `Uploading ${files.length} pictures…` : "Uploading picture…");
    const urls = await upload(files);
    setBusy("");
    if (!urls.length) return;
    if (mode.current === "strip" && urls.length > 1) insert(`<div class="sp-strip">${urls.map((u) => `<img src="${escAttr(u)}" alt="">`).join("")}</div><p><br></p>`);
    else insert(urls.map((u) => `<figure class="sp-fig"><img src="${escAttr(u)}" alt=""></figure>`).join("") + "<p><br></p>");
  };
  const click = (e) => {
    const b = e.target.closest("figure, .sp-strip");
    box.current.querySelectorAll(".rt-sel").forEach((x) => x.classList.remove("rt-sel"));
    if (b && box.current.contains(b) && !e.target.closest("figcaption")) { b.classList.add("rt-sel"); setSel(b); } else setSel(null);
  };
  const removeSel = () => { if (sel) { sel.remove(); setSel(null); emit(); } };

  const B = ({ on, label, children, title }) => <button type="button" className="a-btn a-btn-sm a-btn-ghost" title={title || label} aria-label={label} onMouseDown={(e) => e.preventDefault()} onClick={on}>{children || label}</button>;
  return (
    <div className="rt">
      <div className="rt-bar" role="toolbar" aria-label="Formatting">
        <B on={() => block("h2")} label="Heading" />
        <B on={() => block("h3")} label="Small heading" />
        <B on={() => block("p")} label="Normal text" />
        <B on={() => cmd("bold")} label="Bold"><b>B</b></B>
        <B on={() => cmd("italic")} label="Italic"><i>I</i></B>
        <B on={() => cmd("insertUnorderedList")} label="Bullet list">• List</B>
        <B on={() => cmd("insertOrderedList")} label="Numbered list">1. List</B>
        <B on={() => block("blockquote")} label="Quote" />
        <B on={link} label="Link" />
        <B on={() => choose("one")} label="Add a picture here"><Icon name="image" />Picture</B>
        <B on={() => choose("strip")} label="Add a strip of pictures people can scroll left and right"><Icon name="image" />Picture strip</B>
        {sel && <button type="button" className="a-btn a-btn-sm a-btn-danger" onClick={removeSel}>Remove selected picture</button>}
        {busy && <span className="sub">{busy}</span>}
      </div>
      <input ref={pick} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={picked} />
      <div ref={box} className="rt-box sp-body" contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label="Story"
        data-ph="Write it like you'd tell a friend, or paste it in. Headings, bold, lists and tables keep their format."
        onInput={emit} onPaste={paste} onClick={click} onBlur={keep} onKeyUp={keep} onMouseUp={keep} />
      <small className="sub" style={len > max ? { color: "var(--bad, #B3261E)" } : undefined}>
        {len > max ? `This story is too long (${len.toLocaleString()} of ${max.toLocaleString()} characters). Shorten it a little.` : "Paste from anywhere (Word, Google Docs, a website, a spreadsheet) and the format stays. Click a picture to select it."}
      </small>
    </div>
  );
}
