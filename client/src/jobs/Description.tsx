import { useMemo } from "react";
import DOMPurify from "dompurify";

// Postings come from other sites: every link opens in a new tab and can't reach back into Hunt.
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
});

const HAS_TAG = /<[a-z][^>]*>/i;

/** Greenhouse sends its HTML entity-encoded ("&lt;p&gt;"). Decode once, then treat it like any other HTML. */
function readableHtml(raw: string | null | undefined) {
  if (!raw) return null;
  let html = raw;
  if (!HAS_TAG.test(html) && /&lt;[a-z]/i.test(html)) html = new DOMParser().parseFromString(html, "text/html").documentElement.textContent ?? "";
  if (!HAS_TAG.test(html)) return null;
  return DOMPurify.sanitize(html, { FORBID_TAGS: ["style", "img", "iframe", "form", "input", "button", "video", "audio"], FORBID_ATTR: ["style", "class", "id"] });
}

export function Description({ html, text }: { html?: string | null; text: string }) {
  const clean = useMemo(() => readableHtml(html), [html]);
  if (!clean && !text.trim()) {
    return (
      <section className="description">
        <p className="muted">No description on file. Open the posting to read it.</p>
      </section>
    );
  }
  return (
    <section className="description" aria-label="Description">
      {clean ? <div className="prose" dangerouslySetInnerHTML={{ __html: clean }} /> : <div className="prose prose-text">{text}</div>}
    </section>
  );
}
