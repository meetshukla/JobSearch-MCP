import { useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { Bot, CalendarClock, CircleDot, Gauge, Link2, UserPlus, UserRound } from "lucide-react";
import type { JobDetail, Status, TimelineItem } from "../../../shared/types.ts";
import { STATUS_LABEL } from "../model.ts";
import { ago, byLabel, day, fullDate } from "../format.ts";
import { Mark, StatusGlyph } from "../glyphs.tsx";
import { Button, Keys } from "../ui.tsx";
import type { SaveJob } from "./JobDetail.tsx";

const ICON = { size: 14, strokeWidth: 1.75 } as const;

/** Turn a timeline line into a sentence with its actor, an icon, and an optional second line. */
function describe(t: TimelineItem): { icon: ReactNode; text: string; sub?: ReactNode } {
  const who = byLabel(t.by);
  const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
  const d = t.data ?? {};
  if (t.kind === "status") {
    const s: Status | undefined = d.status;
    return { icon: s ? <StatusGlyph status={s} size={14} /> : <CircleDot {...ICON} />, text: s ? `${who} marked it ${STATUS_LABEL[s].toLowerCase()}` : t.text };
  }
  if (t.kind === "verdict") {
    if (d.score == null) return { icon: <Gauge {...ICON} />, text: `${who} cleared the verdict` };
    return { icon: <Gauge {...ICON} />, text: `${who} scored it ${d.score} out of 100`, sub: t.text.replace(/^\d+\/100\.\s*/, "") };
  }
  if (t.kind === "follow_up") {
    return { icon: <CalendarClock {...ICON} />, text: d.date ? `${who} set a follow-up for ${day(d.date)}` : `${who} cleared the follow-up` };
  }
  if (t.kind === "contact") return { icon: <UserPlus {...ICON} />, text: `${who} ${lower(t.text)}` };
  if (t.kind === "added") return { icon: <Link2 {...ICON} />, text: t.text };
  return { icon: <CircleDot {...ICON} />, text: t.text };
}

function Author({ by }: { by: string | null }) {
  return <span className="author-icon">{by === "agent" ? <Bot {...ICON} /> : by === "you" ? <UserRound {...ICON} /> : <Mark size={14} />}</span>;
}

export function Activity({ job, save, noteRef }: { job: JobDetail; save: SaveJob; noteRef: RefObject<HTMLTextAreaElement | null> }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!note.trim() || busy) return;
    setBusy(true);
    if (await save({ note: note.trim() })) setNote("");
    setBusy(false);
  };
  const items = [...job.timeline].reverse();
  return (
    <section className="section activity" aria-labelledby="activity-title">
      <div className="section-head">
        <h2 id="activity-title" className="section-title">
          Activity
        </h2>
      </div>
      {items.length > 0 && (
        <ol className="feed">
          {items.map((t, i) => {
            if (t.kind === "note") {
              return (
                <li key={`${t.at}-${i}`} className="feed-note">
                  <p className="feed-note-head">
                    <Author by={t.by} />
                    <span className="feed-who">{byLabel(t.by)}</span>
                    <time className="t3" dateTime={t.at} title={fullDate(t.at)}>
                      {ago(t.at)}
                    </time>
                  </p>
                  <p className="feed-note-text">{t.text}</p>
                </li>
              );
            }
            const d = describe(t);
            return (
              <li key={`${t.at}-${i}`} className="feed-event">
                <span className="feed-icon">{d.icon}</span>
                <div className="feed-body">
                  <p>
                    {d.text}
                    <time className="feed-time" dateTime={t.at} title={fullDate(t.at)}>
                      {ago(t.at)}
                    </time>
                  </p>
                  {d.sub && <p className="feed-sub">{d.sub}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <form className="composer" onSubmit={submit}>
        <textarea
          ref={noteRef}
          className="composer-input"
          rows={2}
          placeholder="Leave a note: what you sent, who replied, what's next"
          aria-label="Note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
            if (e.key === "Escape") e.currentTarget.blur();
          }}
        />
        <div className="composer-foot">
          <span className="composer-hint">
            <Keys k="⌘ ↵" />
          </span>
          <Button type="submit" variant="primary" disabled={!note.trim()} busy={busy}>
            Add note
          </Button>
        </div>
      </form>
    </section>
  );
}
