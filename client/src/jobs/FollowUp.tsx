import type { JobDetail } from "../../../shared/types.ts";
import { day, isDue, todayIso } from "../format.ts";
import { Button } from "../ui.tsx";
import type { SaveJob } from "./JobDetail.tsx";

export function FollowUp({ job, save }: { job: JobDetail; save: SaveJob }) {
  const value = job.follow_up_at?.slice(0, 10) ?? "";
  const set = (date: string | null) => save({ follow_up_at: date }, (cur) => ({ ...cur, follow_up_at: date }));
  const due = isDue(job.follow_up_at);
  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">Follow up</h2>
        {value && <span className={`due-badge${due ? " is-due" : ""}`}>{due ? "Due" : day(value)}</span>}
      </div>
      <div className="follow-row">
        <input className="input input-sm date-input" type="date" aria-label="Follow-up date" value={value} min={value && value < todayIso() ? value : todayIso()} onChange={(e) => e.target.value && set(e.target.value)} />
        {value && (
          <Button variant="ghost" size="sm" onClick={() => set(null)}>
            Clear
          </Button>
        )}
      </div>
      {!value && (
        <div className="quick-dates">
          <button type="button" className="toggle-chip toggle-chip-sm" onClick={() => set(todayIso(3))}>
            In 3 days
          </button>
          <button type="button" className="toggle-chip toggle-chip-sm" onClick={() => set(todayIso(7))}>
            In a week
          </button>
          <button type="button" className="toggle-chip toggle-chip-sm" onClick={() => set(todayIso(14))}>
            In 2 weeks
          </button>
        </div>
      )}
    </section>
  );
}
