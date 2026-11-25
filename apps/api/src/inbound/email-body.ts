import sanitizeHtml from "sanitize-html";

/**
 * Customer mail is untrusted. HTML is reduced to an allowlist of formatting
 * tags: no scripts, styles, event handlers, forms, iframes or images (which
 * would also leak "read" receipts), and links only to http, https and mailto.
 */
const HTML_POLICY: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "div", "span", "b", "strong", "i", "em", "u", "s", "sub", "sup", "small",
    "ul", "ol", "li", "blockquote", "pre", "code", "hr",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "table", "thead", "tbody", "tfoot", "tr", "th", "td", "a",
  ],
  // rel and target are only ever the values set in transformTags below.
  allowedAttributes: { a: ["href", "title", "rel", "target"], td: ["colspan", "rowspan"], th: ["colspan", "rowspan"] },
  allowedSchemes: ["http", "https", "mailto"],
  allowProtocolRelative: false,
  disallowedTagsMode: "discard",
  // Elements whose text must not leak into the output either.
  nonTextTags: ["script", "style", "textarea", "option", "noscript", "head", "title", "template"],
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer nofollow", target: "_blank" }),
  },
};

const TEXT_POLICY: sanitizeHtml.IOptions = {
  allowedTags: [],
  allowedAttributes: {},
  nonTextTags: HTML_POLICY.nonTextTags,
};

const BLOCK_END = /<\/(?:p|div|li|tr|h[1-6]|blockquote|pre|table)\s*>|<br\s*\/?>|<hr\s*\/?>/gi;

function decodeBasicEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function sanitizeEmailHtml(html: string): string {
  return sanitizeHtml(html, HTML_POLICY).trim();
}

/** Plain text from HTML, keeping paragraph and line breaks. */
export function htmlToText(html: string): string {
  return normalizeText(decodeBasicEntities(sanitizeHtml(html.replace(BLOCK_END, (tag) => `${tag}\n`), TEXT_POLICY)));
}

/** The stored form of an inbound body: plain text always, sanitized HTML when the mail had any. */
export function toStoredBody(email: { text?: string; html?: string }): { bodyText: string; bodyHtml: string | null } {
  const bodyHtml = email.html === undefined ? null : sanitizeEmailHtml(email.html) || null;
  const bodyText = email.text !== undefined ? normalizeText(email.text) : htmlToText(email.html ?? "");
  return { bodyText, bodyHtml };
}
