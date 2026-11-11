import { useState, type FormEvent } from "react";
import { CalendarClock, CircleDot, Gauge, MessageSquare, Plus, UserPlus } from "lucide-react";
import type { JobDetail } from "../../../shared/types.ts";
import { ago, byLabel, fullDate } from "../format.ts";
import { Button } from "../ui.tsx";
import type { SaveJob } from "./JobDetail.tsx";

const KIND_ICON: Record<string, typeof CircleDot> = {
  note: MessageSquare,
  status: CircleDot,
  verdict: Gauge,
  contact: UserPlus,
  follow_up: CalendarClock,
  added: Plus,
};

export function Activity({ job, save }: { job: JobDetail; save: SaveJob }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!note.trim() || busy) return;
    setBusy(true);
    if (await save({ note: note.trim() })) setNote("");
    setBusy(false);
  };
  return (
    <section className="activity" aria-label="Activity">
      <h2 className="section-title">Activity</h2>
      <form className="composer" onSubmit={submit}>
        <textarea
          className="composer-input"
          rows={2}
          placeholder="Add a note: what you sent, who replied, what's next"
          aria-label="Note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
        />
        <div className="composer-foot">
          <span className="composer-hint">
            <kbd className="kbd">⌘</kbd>
            <kbd className="kbd">↵</kbd>
          </span>
          <Button type="submit" size="sm" variant="primary" disabled={!note.trim()} busy={busy}>
            Add note
          </Button>
        </div>
      </form>
      {job.timeline.length > 0 && (
        <ol className="timeline">
          {job.timeline.map((t, i) => {
            const Icon = KIND_ICON[t.kind] ?? CircleDot;
            return (
              <li key={`${t.at}-${i}`} className={`event event-${t.kind}`}>
                <span className="event-icon">
                  <Icon size={14} strokeWidth={1.75} />
                </span>
                <div className="event-body">
                  <p className="event-text">{t.text}</p>
                  <p className="event-meta" title={fullDate(t.at)}>
                    {byLabel(t.by)} · {ago(t.at)}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
