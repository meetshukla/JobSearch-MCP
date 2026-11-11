import { useState, type FormEvent } from "react";
import { Pencil } from "lucide-react";
import type { JobDetail } from "../../../shared/types.ts";
import { ago, byLabel, scoreTone } from "../format.ts";
import { Button } from "../ui.tsx";
import type { SaveJob } from "./JobDetail.tsx";

export function VerdictCard({ job, save }: { job: JobDetail; save: SaveJob }) {
  const [editing, setEditing] = useState(false);
  const v = job.verdict;
  const by = v?.by ?? null;

  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">Verdict</h2>
        {v && !editing && <Button variant="ghost" size="sm" icon={<Pencil size={14} strokeWidth={1.75} />} onClick={() => setEditing(true)} aria-label="Edit verdict" title="Edit verdict" />}
      </div>
      {editing ? (
        <VerdictForm job={job} save={save} onDone={() => setEditing(false)} />
      ) : v ? (
        <div className="verdict">
          <div className={`verdict-score score-${scoreTone(v.score)}`}>
            <span className="verdict-num">{v.score}</span>
            <span className="verdict-max">/100</span>
          </div>
          <p className="verdict-note">{v.note}</p>
          <p className="card-foot">
            {byLabel(by)} · {ago(v.at)}
          </p>
        </div>
      ) : (
        <div className="card-empty">
          <p className="muted">No verdict yet. Your agent scores jobs when it reviews them, or add your own.</p>
          <Button size="sm" onClick={() => setEditing(true)}>
            Add verdict
          </Button>
        </div>
      )}
    </section>
  );
}

function VerdictForm({ job, save, onDone }: { job: JobDetail; save: SaveJob; onDone: () => void }) {
  const [score, setScore] = useState(job.verdict ? String(job.verdict.score) : "");
  const [note, setNote] = useState(job.verdict?.note ?? "");
  const [busy, setBusy] = useState(false);
  const n = Number(score);
  const valid = score.trim() !== "" && Number.isFinite(n) && n >= 0 && n <= 100 && note.trim().length > 0;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    if (await save({ verdict: { score: Math.round(n), note: note.trim() } })) onDone();
    setBusy(false);
  };
  const clear = async () => {
    setBusy(true);
    if (await save({ verdict: null })) onDone();
    setBusy(false);
  };

  return (
    <form className="stack-form" onSubmit={submit}>
      <div className="verdict-inputs">
        <label className="field field-score">
          <span className="label">Score</span>
          <input className="input input-sm tnum" type="number" min={0} max={100} inputMode="numeric" placeholder="0–100" value={score} onChange={(e) => setScore(e.target.value)} autoFocus />
        </label>
        <label className="field">
          <span className="label">Why, in one line</span>
          <input className="input input-sm" value={note} maxLength={1000} placeholder="Strong TypeScript match, remote in Canada" onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
      <div className="form-actions">
        {job.verdict && (
          <Button variant="ghost" size="sm" onClick={clear} disabled={busy} className="push-start">
            Clear verdict
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onDone} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" size="sm" disabled={!valid} busy={busy}>
          Save
        </Button>
      </div>
    </form>
  );
}
