import { useEffect, useRef, useState } from "react";
import type { Filters as FilterSet } from "../../../shared/types.ts";
import { api, tool, type FiltersPreview } from "../api.ts";
import { bump } from "../live.ts";
import { plural } from "../format.ts";
import { Button, Spinner, Switch, TokenField } from "../ui.tsx";
import { toast } from "../toast.tsx";
import { PageHead, Row, Section } from "./SettingsView.tsx";

type ListKey = "titles" | "skip_titles" | "places" | "remote_regions" | "skip_if_description" | "skip_companies";
type BoolKey = "onsite" | "remote" | "remote_unclear" | "show_undated";

const same = (a: FilterSet, b: FilterSet) => JSON.stringify(a) === JSON.stringify(b);

export function Filters({ saved, defaults }: { saved: FilterSet; defaults: FilterSet }) {
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
  const up = (patch: Partial<FilterSet>) => setDraft((d) => ({ ...d, ...patch }));
  const list = (k: ListKey, label: string, placeholder: string, disabled = false) => (
    <TokenField id={k} label={label} value={draft[k]} onChange={(v) => up({ [k]: v })} placeholder={placeholder} disabled={disabled} />
  );
  const toggle = (k: BoolKey, disabled = false) => <Switch id={k} checked={draft[k]} disabled={disabled} onChange={(v) => up({ [k]: v })} />;

  const save = async () => {
    setBusy(true);
    try {
      const r = await tool("update_settings", { filters: draft });
      base.current = r.filters;
      setDraft(r.filters);
      bump(["settings", "jobs"]);
      toast(r.rereading_sources ? "Filters saved. Hunt re-reads every source within the hour." : "Filters saved");
    } catch (e) {
      toast((e as Error).message, { tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead title="Filters">Hunt keeps only the jobs that pass these. Every filter is optional, and phrases match whole words in any case.</PageHead>

      <Section title="Job titles" id="f-titles">
        <Row label="Keep titles with" htmlFor="titles" help={"Empty keeps every title. “engineer” matches “Senior Engineer II”, not “Engineering”."} stack>
          {list("titles", "Keep titles with", "software engineer, frontend")}
        </Row>
        <Row label="Skip titles with" htmlFor="skip_titles" stack>
          {list("skip_titles", "Skip titles with", "intern, sales engineer")}
        </Row>
      </Section>

      <Section title="Where you can work" id="f-where">
        <Row label="On-site and hybrid jobs" htmlFor="onsite">
          {toggle("onsite")}
        </Row>
        <Row label="In these places" htmlFor="places" help="As companies write them. Empty means anywhere." stack disabled={!draft.onsite}>
          {list("places", "In these places", "Toronto, Ottawa", !draft.onsite)}
        </Row>
        <Row label="Remote jobs" htmlFor="remote">
          {toggle("remote")}
        </Row>
        <Row label="Open to these regions" htmlFor="remote_regions" help="Empty means any region." stack disabled={!draft.remote}>
          {list("remote_regions", "Open to these regions", "Canada, North America, Worldwide", !draft.remote)}
        </Row>
        <Row label={"Keep remote jobs that only say “Remote”"} htmlFor="remote_unclear" help="Some postings don't say where they're open to." disabled={!draft.remote}>
          {toggle("remote_unclear", !draft.remote)}
        </Row>
      </Section>

      <Section title="How recent" id="f-recent">
        <Row label="Posted within" htmlFor="days" help="Older postings are often filled already.">
          <div className="days">
            <input
              id="days"
              className="input days-input tnum"
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
            <span className="t3">days</span>
            <label className="check">
              <input type="checkbox" checked={draft.posted_within_days === null} onChange={(e) => up({ posted_within_days: e.target.checked ? null : lastDays })} />
              Any age
            </label>
          </div>
        </Row>
        <Row label="Keep jobs with no posting date" htmlFor="show_undated" help="Some boards don't publish one.">
          {toggle("show_undated")}
        </Row>
      </Section>

      <Section title="Skip" id="f-skip">
        <Row label="If the description mentions" htmlFor="skip_if_description" stack>
          {list("skip_if_description", "Skip if the description mentions", "security clearance, unpaid")}
        </Row>
        <Row label="These companies" htmlFor="skip_companies" stack>
          {list("skip_companies", "Skip these companies", "Company names")}
        </Row>
      </Section>

      <div className="save-bar save-bar-sticky">
        <p className="preview" aria-live="polite">
          {preview.loading ? <Spinner /> : null}
          {preview.data &&
            (dirty ? (
              <span>
                <span className="tnum">{plural(preview.data.to_review_now, "job")}</span> to review now,{" "}
                <strong className="tnum">{preview.data.to_review_with_these_filters.toLocaleString()}</strong> with these filters
              </span>
            ) : (
              <span>
                <span className="tnum">{plural(preview.data.to_review_now, "job")}</span> to review with these filters
              </span>
            ))}
        </p>
        <div className="save-actions">
          <Button variant="ghost" onClick={() => setDraft(defaults)} disabled={same(draft, defaults)}>
            Reset
          </Button>
          <Button variant="primary" onClick={save} disabled={!dirty} busy={busy}>
            Save filters
          </Button>
        </div>
      </div>
    </>
  );
}

function usePreview(filters: FilterSet) {
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
