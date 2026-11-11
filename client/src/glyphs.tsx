import type { ReactNode } from "react";
import type { Status } from "../../shared/types.ts";
import { verdictBand } from "./model.ts";

/** Hunt's status glyphs grow out of its mark: a ring, then a dot, then a disc. Shape carries the meaning and color repeats it. */
type GlyphKind = Status | "closed";

const ring = <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />;
const disc = "M8 1.25a6.75 6.75 0 1 1 0 13.5a6.75 6.75 0 1 1 0-13.5Z";

const SHAPES: Record<GlyphKind, ReactNode> = {
  new: ring,
  applied: (
    <>
      {ring}
      <circle cx="8" cy="8" r="2.25" fill="currentColor" />
    </>
  ),
  in_process: (
    <>
      {ring}
      <circle cx="8" cy="8" r="3.5" fill="currentColor" />
    </>
  ),
  skipped: (
    <>
      {ring}
      <path d="M4.6 11.4 11.4 4.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),
  rejected: (
    <path
      fillRule="evenodd"
      fill="currentColor"
      d={`${disc}M9.77 5.17 10.83 6.23 9.06 8 10.83 9.77 9.77 10.83 8 9.06 6.23 10.83 5.17 9.77 6.94 8 5.17 6.23 6.23 5.17 8 6.94Z`}
    />
  ),
  closed: <path fillRule="evenodd" fill="currentColor" d={`${disc}M4.75 7.25h6.5v1.5h-6.5Z`} />,
};

const glyphKind = (status: Status, closed = false): GlyphKind => (closed && status === "new" ? "closed" : status);

export function StatusGlyph({ status, closed = false, size = 16 }: { status: Status; closed?: boolean; size?: number }) {
  const kind = glyphKind(status, closed);
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={`glyph glyph-${kind}`} aria-hidden>
      {SHAPES[kind]}
    </svg>
  );
}

/** The agent's score as a short meter beside the number. Down a list the meters read as a bar chart. */
export function VerdictMeter({ score, wide = false }: { score: number; wide?: boolean }) {
  return (
    <span className={`meter meter-${verdictBand(score)}${wide ? " meter-wide" : ""}`} title={`Verdict ${score}/100`}>
      <span className="meter-track" aria-hidden>
        <span className="meter-fill" style={{ transform: `scaleX(${Math.max(0.04, score / 100)})` }} />
      </span>
      <span className="meter-num tnum">
        {score}
        <span className="sr-only"> out of 100</span>
      </span>
    </span>
  );
}

export function Mark({ size = 20 }: { size?: number }) {
  return (
    <svg className="mark" width={size} height={size} viewBox="0 0 20 20" aria-hidden>
      <rect width="20" height="20" rx="5.5" className="mark-bg" />
      <circle cx="10" cy="10" r="5" fill="none" strokeWidth="1.75" className="mark-ring" />
      <circle cx="10" cy="10" r="1.75" className="mark-dot" />
    </svg>
  );
}
