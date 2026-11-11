import { useLayoutEffect, useMemo, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { Button } from "../ui.tsx";

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

/** Long postings fold after a screenful, so contacts and notes stay within reach. */
const FOLD_AFTER = 640;

export function Description({ html, text, url }: { html?: string | null; text: string; url: string }) {
  const clean = useMemo(() => readableHtml(html), [html]);
  const body = useRef<HTMLDivElement>(null);
  const [long, setLong] = useState(false);
  const [open, setOpen] = useState(false);
  useLayoutEffect(() => {
    setLong((body.current?.scrollHeight ?? 0) > FOLD_AFTER);
  }, [clean, text]);
  if (!clean && !text.trim()) {
    return (
      <section className="description" aria-label="Description">
        <p className="t3">
          No description on file.{" "}
          <a className="link" href={url} target="_blank" rel="noopener noreferrer">
            Read it on the posting
          </a>
          .
        </p>
      </section>
    );
  }
  return (
    <section className="description" aria-label="Description" data-folded={(long && !open) || undefined}>
      {clean ? <div ref={body} className="prose" dangerouslySetInnerHTML={{ __html: clean }} /> : <div ref={body} className="prose prose-text">{text}</div>}
      {long && (
        <Button variant="ghost" className="fold-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "Show less" : "Show the full description"}
        </Button>
      )}
    </section>
  );
}
