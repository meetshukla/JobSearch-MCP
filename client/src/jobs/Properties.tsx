import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Menu } from "@base-ui/react/menu";
import { ArrowUpRight, CalendarClock, Check, ChevronDown, Pencil } from "lucide-react";
import type { JobDetail, Status } from "../../../shared/types.ts";
import { SOURCE_LABEL, STATUS_LABEL, STATUS_ORDER, isDue } from "../model.ts";
import { ago, byLabel, day, dueLabel, fullDate, todayIso } from "../format.ts";
import { StatusGlyph, VerdictMeter } from "../glyphs.tsx";
import { MenuPopup } from "../overlay.tsx";
import { Button, Keys } from "../ui.tsx";
import type { SaveJob } from "./JobDetail.tsx";

type Props = {
  job: JobDetail;
  save: SaveJob;
  setStatus: (s: Status) => void;
  setFollowUp: (date: string | null) => void;
  statusOpen: boolean;
  setStatusOpen: (o: boolean) => void;
  followOpen: boolean;
  setFollowOpen: (o: boolean) => void;
};

/** The job's properties, Linear style: a quiet label and an inline control per row. */
export function Properties({ job: j, save, setStatus, setFollowUp, statusOpen, setStatusOpen, followOpen, setFollowOpen }: Props) {
  const [editingVerdict, setEditingVerdict] = useState(false);
  return (
    <dl className="props">
      <Prop label="Status">
        <StatusMenu status={j.status} closed={j.closed} onChange={setStatus} open={statusOpen} onOpenChange={setStatusOpen} />
      </Prop>
      <Prop label="Verdict">
        {j.verdict && !editingVerdict ? (
          <button type="button" className="prop-value" onClick={() => setEditingVerdict(true)} aria-label={`Verdict ${j.verdict.score} out of 100. Edit`}>
            <VerdictMeter score={j.verdict.score} wide />
            <Pencil size={12} strokeWidth={1.75} className="prop-edit" aria-hidden />
          </button>
        ) : !editingVerdict ? (
          <button type="button" className="prop-value prop-empty" onClick={() => setEditingVerdict(true)}>
            Add verdict
          </button>
        ) : null}
      </Prop>
      {editingVerdict ? (
        <VerdictForm job={j} save={save} onDone={() => setEditingVerdict(false)} />
      ) : (
        j.verdict && (
          <div className="prop-note">
            <p>{j.verdict.note}</p>
            <p className="t3" title={fullDate(j.verdict.at)}>
              {byLabel(j.verdict.by)}, {ago(j.verdict.at)}
            </p>
          </div>
        )
      )}
      <Prop label="Follow up">
        <FollowUpMenu value={j.follow_up_at?.slice(0, 10) ?? null} onChange={setFollowUp} open={followOpen} onOpenChange={setFollowOpen} />
      </Prop>
      <Prop label="Posted">
        <span className="prop-text" title={j.posted_at ? fullDate(j.posted_at) : `Found ${fullDate(j.first_seen_at)}`}>
          {j.posted_at ? ago(j.posted_at) : <span className="t3">No date, found {ago(j.first_seen_at)}</span>}
        </span>
      </Prop>
      <Prop label="Location">
        <span className="prop-text">
          {j.location || (j.remote ? "Remote" : <span className="t3">Not listed</span>)}
          {j.remote && j.location && !/remote/i.test(j.location) && <span className="t3"> (remote)</span>}
        </span>
      </Prop>
      <Prop label="Salary">
        <span className="prop-text">{j.salary ?? <span className="t3">Not listed</span>}</span>
      </Prop>
      <Prop label="Source">
        <span className="prop-text">{SOURCE_LABEL[j.source] ?? j.source}</span>
      </Prop>
      {j.closed && (
        <Prop label="Posting">
          <span className="prop-text t3">Closed, no longer on the board</span>
        </Prop>
      )}
      <Prop label="Link">
        <a className="prop-value prop-link" href={j.apply_url} target="_blank" rel="noopener noreferrer">
          <span className="ellipsis">Open posting</span>
          <ArrowUpRight size={14} strokeWidth={1.75} aria-hidden />
        </a>
      </Prop>
    </dl>
  );
}

function Prop({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="prop">
      <dt className="prop-label">{label}</dt>
      <dd className="prop-cell">{children}</dd>
    </div>
  );
}

type StatusMenuProps = {
  status: Status;
  closed: boolean;
  onChange: (s: Status) => void;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  side?: "top" | "bottom";
  trigger?: "prop" | "button";
};

/** Status as a menu of glyphs. Number keys 1 to 5 pick a status while it's open. */
export function StatusMenu({ status, closed, onChange, open, onOpenChange, side = "bottom", trigger = "prop" }: StatusMenuProps) {
  const [ownOpen, setOwnOpen] = useState(false);
  const isOpen = open ?? ownOpen;
  const setOpen = onOpenChange ?? setOwnOpen;
  // Listen on the window while open, because "s" then "4" typed in one motion lands before focus moves into the menu.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      const n = Number(e.key);
      if (!(n >= 1 && n <= STATUS_ORDER.length) || e.metaKey || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      e.stopPropagation();
      onChange(STATUS_ORDER[n - 1]);
      setOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [isOpen]);
  return (
    <Menu.Root open={isOpen} onOpenChange={(o) => setOpen(o)}>
      <Menu.Trigger className={trigger === "prop" ? "prop-value" : "btn btn-secondary has-icon status-button"} aria-label={`Status: ${STATUS_LABEL[status]}. Change`}>
        <StatusGlyph status={status} closed={closed && status === "new"} />
        <span>{STATUS_LABEL[status]}</span>
        {trigger === "button" && <ChevronDown size={14} strokeWidth={1.75} className="t3" />}
      </Menu.Trigger>
      <MenuPopup side={side}>
        <Menu.RadioGroup value={status} onValueChange={(v: Status) => onChange(v)}>
          {STATUS_ORDER.map((s, i) => (
            <Menu.RadioItem key={s} value={s} className="menu-item" closeOnClick>
              <StatusGlyph status={s} />
              <span className="menu-item-label">{STATUS_LABEL[s]}</span>
              <Menu.RadioItemIndicator className="menu-indicator">
                <Check size={14} strokeWidth={2} />
              </Menu.RadioItemIndicator>
              <Keys k={String(i + 1)} />
            </Menu.RadioItem>
          ))}
        </Menu.RadioGroup>
      </MenuPopup>
    </Menu.Root>
  );
}

const quickDate = new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric" });
const QUICK: { label: string; days: number }[] = [
  { label: "Tomorrow", days: 1 },
  { label: "In 3 days", days: 3 },
  { label: "In a week", days: 7 },
  { label: "In 2 weeks", days: 14 },
];

function FollowUpMenu({ value, onChange, open, onOpenChange }: { value: string | null; onChange: (d: string | null) => void; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [picking, setPicking] = useState(false);
  const date = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!picking) return;
    date.current?.focus();
    try {
      date.current?.showPicker();
    } catch {
      // Some browsers only open the picker on a direct click. The focused field still takes typing.
    }
  }, [picking]);
  if (picking) {
    return (
      <input
        ref={date}
        className="input date-input"
        type="date"
        aria-label="Follow-up date"
        defaultValue={value ?? todayIso(7)}
        min={todayIso()}
        onChange={(e) => {
          if (!e.target.value) return;
          onChange(e.target.value);
          setPicking(false);
        }}
        onBlur={() => setPicking(false)}
        onKeyDown={(e) => e.key === "Escape" && setPicking(false)}
      />
    );
  }
  const due = isDue(value);
  return (
    <Menu.Root open={open} onOpenChange={(o) => onOpenChange(o)}>
      <Menu.Trigger className={`prop-value${value ? "" : " prop-empty"}`} data-due={due || undefined} aria-label={value ? `Follow up ${day(value)}. Change` : "Add a follow-up date"}>
        <CalendarClock size={14} strokeWidth={1.75} aria-hidden />
        <span>{value ? (due && value < todayIso() ? `Overdue, ${day(value)}` : dueLabel(value)) : "Add date"}</span>
      </Menu.Trigger>
      <MenuPopup>
        {QUICK.map((q) => (
          <Menu.Item key={q.days} className="menu-item" onClick={() => onChange(todayIso(q.days))}>
            <span className="menu-item-label">{q.label}</span>
            <span className="menu-hint">{quickDate.format(new Date(`${todayIso(q.days)}T12:00:00`))}</span>
          </Menu.Item>
        ))}
        <Menu.Separator className="menu-sep" />
        <Menu.Item className="menu-item" onClick={() => setPicking(true)}>
          <span className="menu-item-label">Pick a date…</span>
        </Menu.Item>
        {value && (
          <Menu.Item className="menu-item" onClick={() => onChange(null)}>
            <span className="menu-item-label">Clear follow-up</span>
          </Menu.Item>
        )}
      </MenuPopup>
    </Menu.Root>
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
    <form className="verdict-form" onSubmit={submit} onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), onDone())}>
      <div className="verdict-inputs">
        <label className="field verdict-score">
          <span className="label">Score</span>
          <input className="input tnum" type="number" min={0} max={100} inputMode="numeric" placeholder="0 to 100" value={score} onChange={(e) => setScore(e.target.value)} autoFocus />
        </label>
        <label className="field">
          <span className="label">Why, in one line</span>
          <textarea className="textarea verdict-note" rows={2} value={note} maxLength={1000} placeholder="Strong TypeScript match, remote in Canada" onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
      <div className="form-actions">
        {job.verdict && (
          <Button variant="ghost" onClick={clear} disabled={busy} className="push-start">
            Clear
          </Button>
        )}
        <Button variant="ghost" onClick={onDone} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={!valid} busy={busy}>
          Save
        </Button>
      </div>
    </form>
  );
}
