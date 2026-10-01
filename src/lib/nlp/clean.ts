/** Text normalisation for externally sourced content. Output is plain text only. */
const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&#x27;": "'", "&#x2F;": "/", "&nbsp;": " " };

export const MAX_TEXT_LENGTH = 4000;

export function cleanText(input: string): string {
  let s = input ?? "";
  s = s.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ");
  s = s.replace(/<[^>]+>/g, " ");
  s = s.replace(/&(amp|lt|gt|quot|#39|#x27|#x2F|nbsp);/g, (m) => ENTITIES[m] ?? m);
  s = s.replace(/[​-‍﻿\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  s = s.replace(/\s+/g, " ").trim();
  return s.length > MAX_TEXT_LENGTH ? s.slice(0, MAX_TEXT_LENGTH) : s;
}

export function extractUrls(text: string): string[] {
  return Array.from(text.matchAll(/https?:\/\/[^\s)<>"']+/g), (m) => m[0]);
}

export function stripUrls(text: string): string {
  return text.replace(/https?:\/\/[^\s)<>"']+/g, " ").replace(/\s+/g, " ").trim();
}

/** Canonical URL for duplicate detection: lowercase host, drop tracking params, fragments, trailing slash. */
export function canonicalUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    u.hash = "";
    for (const p of Array.from(u.searchParams.keys())) {
      if (/^(utm_|ref|fbclid|gclid|share|si$)/i.test(p)) u.searchParams.delete(p);
    }
    const host = u.hostname.toLowerCase().replace(/^(www\.|m\.|old\.|amp\.)/, "");
    const pathname = u.pathname.replace(/\/+$/, "");
    const qs = u.searchParams.toString();
    return `${host}${pathname}${qs ? `?${qs}` : ""}`;
  } catch {
    return null;
  }
}

/** Safe for rendering as text in React (React escapes anyway); also trims for previews. */
export function preview(text: string, max = 280): string {
  const s = cleanText(text);
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
