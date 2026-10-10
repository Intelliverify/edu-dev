"use client";
import React from "react";

// Lightweight, SAFE rich-text renderer — no dangerouslySetInnerHTML, no deps.
// Supports a tiny markdown-ish syntax authored in a plain <textarea>:
//   **bold**        -> bold
//   *italic*        -> italic
//   ==highlight==   -> highlighted (tinted with the subject accent)
//   https://…       -> clickable link
//   newlines        -> preserved (pre-wrap)
// Anything else renders as literal text.

type TokType = "text" | "bold" | "italic" | "mark" | "link";
type Tok = { t: TokType; v: string };

const RULES: { re: RegExp; t: TokType }[] = [
  { re: /\*\*([^*\n]+)\*\*/, t: "bold" },
  { re: /==([^=\n]+)==/, t: "mark" },
  { re: /\*([^*\n]+)\*/, t: "italic" },
  { re: /(https?:\/\/[^\s]+)/, t: "link" },
];

function tokenize(input: string): Tok[] {
  const toks: Tok[] = [];
  let s = input;
  let guard = 0;
  while (s.length && guard++ < 5000) {
    let best: { idx: number; len: number; v: string; t: TokType } | null = null;
    for (const r of RULES) {
      const m = r.re.exec(s);
      if (m && (best === null || m.index < best.idx)) {
        best = { idx: m.index, len: m[0].length, v: m[1], t: r.t };
      }
    }
    if (!best) { toks.push({ t: "text", v: s }); break; }
    if (best.idx > 0) toks.push({ t: "text", v: s.slice(0, best.idx) });
    toks.push({ t: best.t, v: best.v });
    s = s.slice(best.idx + best.len);
  }
  return toks;
}

export function RichText({
  text,
  accent = "#178F78",
  style,
}: {
  text?: string | null;
  accent?: string;
  style?: React.CSSProperties;
}) {
  if (!text) return null;
  const toks = tokenize(String(text));
  return (
    <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", ...style }}>
      {toks.map((tk, i) => {
        switch (tk.t) {
          case "bold":
            return <strong key={i}>{tk.v}</strong>;
          case "italic":
            return <em key={i}>{tk.v}</em>;
          case "mark":
            return (
              <mark key={i} style={{ background: accent + "33", color: "inherit", padding: "0 3px", borderRadius: 4 }}>
                {tk.v}
              </mark>
            );
          case "link":
            return (
              <a key={i} href={tk.v} target="_blank" rel="noopener noreferrer" style={{ color: accent, textDecoration: "underline", wordBreak: "break-all" }}>
                {tk.v}
              </a>
            );
          default:
            return <React.Fragment key={i}>{tk.v}</React.Fragment>;
        }
      })}
    </span>
  );
}

export default RichText;
