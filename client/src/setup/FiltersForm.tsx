import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Filters } from "../../../shared/types.ts";
import { api, tool, type FiltersPreview } from "../api.ts";
import { bump } from "../live.ts";
import { plural } from "../format.ts";
import { Button, ChipInput, Spinner, Switch, toast } from "../ui.tsx";
import { SectionHead } from "./SetupPage.tsx";

type ListKey = "titles" | "skip_titles" | "places" | "remote_regions" | "skip_if_description" | "skip_companies";
type BoolKey = "onsite" | "remote" | "remote_unclear" | "show_undated";

const same = (a: Filters, b: Filters) => JSON.stringify(a) === JSON.stringify(b);

export function FiltersForm({ saved, defaults }: { saved: Filters; defaults: Filters }) {
  const [draft, setDraft] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [lastDays, setLastDays] = useState(saved.posted_within_days ?? defaults.posted_within_days ?? 7);
  const base = useRef(saved);
  const dirty = !same(draft, base.current);

  useEffect(() => {
    if (!dirty) setDraft(saved);
    base.current = saved;
  }, [saved]);

  const preview = usePreview(draft);
  const up = (patch: Partial<Filters>) => setDraft((d) => ({ ...d, ...patch }));
  const list = (k: ListKey) => ({ value: draft[k], onChange: (v: string[]) => up({ [k]: v }) });
  const bool = (k: BoolKey) => ({ checked: draft[k], onChange: (v: boolean) => up({ [k]: v }) });

  const save = async () => {
    setBusy(true);
    try {
      const r = await tool("update_settings", { filters: draft });
      base.current = r.filters;
      setDraft(r.filters);
      bump(["settings", "jobs"]);
      toast(r.rereading_sources ? "Filters saved. Hunt re-reads every source within the hour." : "Filters saved");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="section">
      <SectionHead title="Filters">
        Hunt keeps only the jobs that pass these. Every filter is optional: empty a list to keep everything. Phrases match whole words, in any case.
      </SectionHead>

      <FieldGroup title="Job titles">
        <ListField id="titles" label="Keep titles with" help={'Empty keeps every title. "engineer" matches "Senior Engineer II", not "Engineering".'} {...list("titles")} placeholder="software engineer, frontend" />
        <ListField id="skip_titles" label="Skip titles with" {...list("skip_titles")} placeholder="intern, sales engineer" />
      </FieldGroup>

      <FieldGroup title="Where you can work">
        <SwitchRow id="onsite" label="On-site and hybrid jobs" {...bool("onsite")} />
        <ListField id="places" label="In these places" help="As companies write them. Empty means anywhere." disabled={!draft.onsite} {...list("places")} placeholder="Toronto, Ottawa" indent />
        <SwitchRow id="remote" label="Remote jobs" {...bool("remote")} />
        <ListField id="remote_regions" label="Open to these regions" help="Empty means any region." disabled={!draft.remote} {...list("remote_regions")} placeholder="Canada, North America, Worldwide" indent />
        <SwitchRow id="remote_unclear" label={'Keep remote jobs that only say "Remote"'} help="Some postings don't say where they're open to." disabled={!draft.remote} {...bool("remote_unclear")} indent />
      </FieldGroup>

      <FieldGroup title="How recent">
        <div className="frow frow-days">
          <div className="frow-text">
            <label className="flabel" htmlFor="days">
              Posted within
            </label>
            <p className="help">Older postings are often filled already.</p>
          </div>
          <div className="days">
            <input
              id="days"
              className="input input-sm days-input tnum"
              type="number"
              min={1}
              inputMode="numeric"
              value={draft.posted_within_days ?? lastDays}
              disabled={draft.posted_within_days === null}
              onChange={(e) => {
                const n = Math.max(1, Math.round(Number(e.target.value) || 1));
                setLastDays(n);
                up({ posted_within_days: n });
              }}
            />
            <span className="muted">days</span>
            <label className="check">
              <input type="checkbox" checked={draft.posted_within_days === null} onChange={(e) => up({ posted_within_days: e.target.checked ? null : lastDays })} />
              Any age
            </label>
          </div>
        </div>
        <SwitchRow id="show_undated" label="Keep jobs with no posting date" help="Some boards don't publish one." {...bool("show_undated")} />
      </FieldGroup>

      <FieldGroup title="Skip">
        <ListField id="skip_if_description" label="Skip if the description mentions" {...list("skip_if_description")} placeholder="security clearance, unpaid" />
        <ListField id="skip_companies" label="Skip these companies" {...list("skip_companies")} placeholder="Company names" />
      </FieldGroup>

      <div className="save-bar sticky">
        <PreviewLine preview={preview} dirty={dirty} />
        <Button variant="ghost" onClick={() => setDraft(defaults)} disabled={same(draft, defaults)} className="push-end">
          Reset to defaults
        </Button>
        <Button variant="primary" onClick={save} disabled={!dirty} busy={busy}>
          Save filters
        </Button>
      </div>
      <p className="help save-note">Saving re-reads every source within the hour, so jobs that match now come in too.</p>
    </div>
  );
}

function usePreview(filters: Filters) {
  const [state, setState] = useState<{ data?: FiltersPreview; loading: boolean }>({ loading: true });
  const key = JSON.stringify(filters);
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true }));
    const t = setTimeout(() => {
      api.previewFilters(filters).then(
        (data) => live && setState({ data, loading: false }),
        () => live && setState((s) => ({ ...s, loading: false })),
      );
    }, 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [key]);
  return state;
}

function PreviewLine({ preview, dirty }: { preview: { data?: FiltersPreview; loading: boolean }; dirty: boolean }) {
  const d = preview.data;
  return (
    <p className="preview" aria-live="polite">
      {preview.loading && <Spinner />}
      {d && (
        <span>
          {dirty ? (
            <>
              <span className="tnum">{plural(d.to_review_now, "job")}</span> to review now,{" "}
              <strong className="tnum" data-delta={Math.sign(d.to_review_with_these_filters - d.to_review_now)}>
                {d.to_review_with_these_filters.toLocaleString()}
              </strong>{" "}
              with these filters
            </>
          ) : (
            <>
              <span className="tnum">{plural(d.to_review_now, "job")}</span> to review with your saved filters
            </>
          )}
        </span>
      )}
    </p>
  );
}

function FieldGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="fgroup">
      <legend className="group-title">{title}</legend>
      <div className="fgroup-body">{children}</div>
    </fieldset>
  );
}

function ListField(p: { id: string; label: string; help?: string; value: string[]; onChange: (v: string[]) => void; placeholder?: string; disabled?: boolean; indent?: boolean }) {
  return (
    <div className={`frow frow-stack${p.indent ? " indent" : ""}`} data-disabled={p.disabled || undefined}>
      <div className="frow-text">
        <label className="flabel" htmlFor={p.id}>
          {p.label}
        </label>
        {p.help && <p className="help">{p.help}</p>}
      </div>
      <ChipInput id={p.id} label={p.label} value={p.value} onChange={p.onChange} placeholder={p.placeholder ? `${p.placeholder}…` : "Type and press Enter"} />
    </div>
  );
}

function SwitchRow(p: { id: string; label: string; help?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; indent?: boolean }) {
  return (
    <div className={`frow${p.indent ? " indent" : ""}`} data-disabled={p.disabled || undefined}>
      <div className="frow-text">
        <label className="flabel" htmlFor={p.id}>
          {p.label}
        </label>
        {p.help && <p className="help">{p.help}</p>}
      </div>
      <Switch id={p.id} label={p.label} checked={p.checked} onChange={p.onChange} />
    </div>
  );
}
