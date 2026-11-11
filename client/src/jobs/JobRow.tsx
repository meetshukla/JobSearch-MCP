import { Users } from "lucide-react";
import type { JobRow } from "../../../shared/types.ts";
import { STATUS_LABEL, type ViewId } from "../model.ts";
import { day, shortAge } from "../format.ts";
import { Link, jobsPath, type ListQuery } from "../router.tsx";
import { StatusGlyph, VerdictMeter } from "../glyphs.tsx";

/** One job as one link: glyph, title, company, place, flags, verdict and age, in columns that line up down the list. */
export function JobRowLink({ job: j, view, query, open, cursor, onFocus }: { job: JobRow; view: ViewId; query: ListQuery; open: boolean; cursor: boolean; onFocus: () => void }) {
  const place = j.location || (j.remote ? "Remote" : "");
  return (
    <Link
      to={jobsPath(view, j.id, query)}
      className="row"
      data-job={j.id}
      data-dim={j.status === "rejected" || undefined}
      data-cursor={cursor || undefined}
      aria-current={open ? "page" : undefined}
      onFocus={onFocus}
      onPointerDown={onFocus}
    >
      <span className="row-glyph" title={j.closed ? "Closed" : STATUS_LABEL[j.status]}>
        <StatusGlyph status={j.status} closed={j.closed} />
        <span className="sr-only">{j.closed && j.status === "new" ? "Closed" : STATUS_LABEL[j.status]}. </span>
      </span>
      <span className="row-title">{j.title.trim()}</span>
      <span className="row-company">{j.company}</span>
      <span className="row-loc">{place}</span>
      {(j.closed && j.status !== "new") || j.contacts > 0 ? (
        <span className="row-flags">
          {j.closed && j.status !== "new" && <span className="flag">Closed</span>}
          {j.contacts > 0 && (
            <span className="flag" title={`${j.contacts} contact${j.contacts === 1 ? "" : "s"}`}>
              <Users size={12} strokeWidth={1.75} aria-hidden />
              {j.contacts}
            </span>
          )}
        </span>
      ) : null}
      <span className="row-verdict">{j.verdict && <VerdictMeter score={j.verdict.score} />}</span>
      {view === "applied" && j.status_at ? (
        <span className="row-age tnum" title={`${STATUS_LABEL[j.status]} ${day(j.status_at)}`}>
          {shortAge(j.status_at) ?? "–"}
        </span>
      ) : (
        <span className="row-age tnum" title={j.posted_at ? `Posted ${day(j.posted_at)}` : "No posting date"}>
          {shortAge(j.posted_at) ?? "–"}
        </span>
      )}
    </Link>
  );
}
