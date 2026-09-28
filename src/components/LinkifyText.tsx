"use client";
import React from "react";

/**
 * Renders a plain string, turning any URL inside it into a clickable link that
 * opens in a new tab. On mobile browsers a YouTube/Maps/etc. link will offer to
 * open the relevant installed app, same as any other web link.
 *
 * Matches http(s):// and bare www. links; trailing sentence punctuation
 * (. , ; : ! ?) is kept out of the link.
 */
const URL_RE = /((?:https?:\/\/|www\.)[^\s]+)/gi;   // split (captures the URL)
const IS_URL = /^(?:https?:\/\/|www\.)[^\s]+$/i;    // test a single part (no /g state)

export default function LinkifyText({
  text,
  style,
  linkStyle,
}: {
  text?: string | null;
  style?: React.CSSProperties;
  linkStyle?: React.CSSProperties;
}) {
  const t = text ?? "";
  if (!t) return null;

  const parts = t.split(URL_RE);
  return (
    <span style={style}>
      {parts.map((part, i) => {
        if (!IS_URL.test(part)) return <React.Fragment key={i}>{part}</React.Fragment>;
        const clean = part.replace(/[.,;:!?)\]}'"]+$/, "");     // drop trailing punctuation
        const trailing = part.slice(clean.length);
        const href = /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;
        return (
          <React.Fragment key={i}>
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{ color: "#178F78", textDecoration: "underline", fontWeight: 600, wordBreak: "break-word", ...linkStyle }}
            >
              {clean}
            </a>
            {trailing}
          </React.Fragment>
        );
      })}
    </span>
  );
}
