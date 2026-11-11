import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { ArrowUpRight, ClipboardPaste, Keyboard, Link2, Link as LinkIcon, MessageSquare, Monitor, Moon, Plus, Rss, Settings, Sun } from "lucide-react";
import type { JobRow } from "../../../shared/types.ts";
import { tool } from "../api.ts";
import { bump } from "../live.ts";
import { STATUS_LABEL, STATUS_ORDER, SETTINGS_SECTIONS, VIEWS, VIEW_ORDER, viewForStatus } from "../model.ts";
import { isUrl } from "../format.ts";
import { jobsPath, navigate, settingsPath } from "../router.tsx";
import { useActiveJob, useAppData, type PaletteMode } from "../data.tsx";
import { StatusGlyph } from "../glyphs.tsx";
import { setTheme, THEMES, THEME_LABEL, useTheme } from "../theme.ts";
import { Button, Keys, Spinner } from "../ui.tsx";
import { toast } from "../toast.tsx";

type Cmd = {
  id: string;
  group: string;
  label: string;
  icon: ReactNode;
  hint?: string;
  keys?: string;
  keywords?: string;
  /** Return a promise to keep the menu open with a busy row until it settles. Return "stay" to keep it open. */
  run: () => void | "stay" | Promise<unknown>;
};

const ICON = { size: 16, strokeWidth: 1.75 } as const;

export function CommandMenu({ mode, onMode }: { mode: PaletteMode | null; onMode: (m: PaletteMode | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <Dialog.Root open={mode !== null} onOpenChange={(o) => !o && onMode(null)}>
      <Dialog.Portal>
        <Dialog.Backdrop className="scrim scrim-palette" />
        <Dialog.Popup className="palette" initialFocus={input} aria-label="Command menu">
          {mode && <Palette key={mode} mode={mode} input={input} onMode={onMode} />}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Palette({ mode, input, onMode }: { mode: PaletteMode; input: React.RefObject<HTMLInputElement | null>; onMode: (m: PaletteMode | null) => void }) {
  const { counts, today, openShortcuts } = useAppData();
  const job = useActiveJob();
  const theme = useTheme();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const jobs = useJobSearch(mode === "all" && !isUrl(query) ? query : "");
  const close = () => onMode(null);
  const q = query.trim();

  const commands = useMemo(() => {
    const list: Cmd[] = [];
    if (isUrl(q)) {
      list.push({
        id: "track",
        group: "Track",
        label: "Track this job",
        hint: q.replace(/^https?:\/\//, "").slice(0, 48),
        icon: <Link2 {...ICON} />,
        run: async () => {
          const j = await tool("add_job", { url: q });
          bump(["jobs"]);
          toast(`Tracking ${j.title} at ${j.company}`);
          navigate(jobsPath(viewForStatus(j.status), j.id));
        },
      });
    }
    if (mode === "track") return list;

    for (const j of jobs) {
      list.push({
        id: `job-${j.id}`,
        group: "Jobs",
        label: j.title,
        hint: j.company,
        icon: <StatusGlyph status={j.status} closed={j.closed} />,
        run: () => navigate(jobsPath(viewForStatus(j.status), j.id)),
      });
    }
    if (job) {
      const g = `${job.company}, ${job.title}`;
      for (const s of STATUS_ORDER) {
        if (s === job.status) continue;
        list.push({ id: `status-${s}`, group: g, label: `Mark as ${STATUS_LABEL[s].toLowerCase()}`, icon: <StatusGlyph status={s} />, keywords: "status change", run: () => job.setStatus(s) });
      }
      list.push(
        { id: "open", group: g, label: "Open the posting", icon: <ArrowUpRight {...ICON} />, keys: "O", keywords: "apply link", run: () => void window.open(job.applyUrl, "_blank", "noopener,noreferrer") },
        { id: "note", group: g, label: "Write a note", icon: <MessageSquare {...ICON} />, keys: "N", keywords: "comment activity", run: () => void setTimeout(job.focusNote, 0) },
        {
          id: "copy",
          group: g,
          label: "Copy link to this job",
          icon: <LinkIcon {...ICON} />,
          keywords: "share url",
          run: async () => {
            await navigator.clipboard.writeText(location.href);
            toast("Link copied");
          },
        },
      );
    }
    for (const id of VIEW_ORDER) {
      const v = VIEWS[id];
      const n = v.count(counts, today);
      list.push({ id: `view-${id}`, group: "Go to", label: v.label, hint: n ? n.toLocaleString() : undefined, icon: <v.icon {...ICON} />, keywords: "view", run: () => navigate(jobsPath(id)) });
    }
    for (const s of SETTINGS_SECTIONS) {
      list.push({ id: `settings-${s.id}`, group: "Go to", label: `Settings: ${s.label}`, icon: <Settings {...ICON} />, run: () => navigate(settingsPath(s.id)) });
    }
    list.push({ id: "track-mode", group: "Create", label: "Track a job from a link", icon: <Plus {...ICON} />, keys: "T", keywords: "add url posting", run: () => (setQuery(""), onMode("track"), "stay") });
    if (q && !isUrl(q)) {
      list.push({
        id: "add-source",
        group: "Create",
        label: `Add “${q}” as a source`,
        icon: <Rss {...ICON} />,
        keywords: `${q} company board feed`,
        run: async () => {
          const r = await tool("add_sources", { items: [q] });
          bump(["sources"]);
          const res = r.results[0];
          toast(res?.message ?? "Source added", { tone: res?.status === "error" ? "error" : "default" });
        },
      });
    }
    for (const t of THEMES) {
      const Icon = t === "system" ? Monitor : t === "light" ? Sun : Moon;
      list.push({ id: `theme-${t}`, group: "Preferences", label: `Theme: ${THEME_LABEL[t]}`, hint: t === theme ? "Current" : undefined, icon: <Icon {...ICON} />, keywords: "appearance dark light mode", run: () => setTheme(t) });
    }
    list.push({ id: "shortcuts", group: "Preferences", label: "Keyboard shortcuts", icon: <Keyboard {...ICON} />, keys: "?", keywords: "help keys", run: openShortcuts });
    return list;
  }, [q, mode, jobs, job, counts, today, theme, onMode, openShortcuts]);

  const shown = useMemo(() => {
    if (!q || isUrl(q)) return commands;
    const words = q.toLowerCase().split(/\s+/);
    return commands.filter((c) => c.group === "Jobs" || c.id === "add-source" || words.every((w) => `${c.label} ${c.keywords ?? ""} ${c.group}`.toLowerCase().includes(w)));
  }, [commands, q]);

  useEffect(() => setActive(0), [q, mode]);
  useEffect(() => {
    document.getElementById(`cmd-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const runAt = async (i: number) => {
    const c = shown[i];
    if (!c || busy) return;
    setError(null);
    const r = c.run();
    if (r === "stay") return;
    if (r instanceof Promise) {
      setBusy(c.id);
      try {
        await r;
        close();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(null);
      }
      return;
    }
    close();
  };

  const onKey = (e: React.KeyboardEvent) => {
    const n = shown.length;
    if (e.key === "ArrowDown" || (e.ctrlKey && e.key === "n")) {
      e.preventDefault();
      setActive((a) => (n ? (a + 1) % n : 0));
    } else if (e.key === "ArrowUp" || (e.ctrlKey && e.key === "p")) {
      e.preventDefault();
      setActive((a) => (n ? (a - 1 + n) % n : 0));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(Math.max(0, n - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      runAt(active);
    }
  };

  let lastGroup = "";
  return (
    <div className="palette-body" onKeyDown={onKey}>
      <div className="palette-input">
        <input
          ref={input}
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-autocomplete="list"
          aria-activedescendant={shown.length ? `cmd-${active}` : undefined}
          aria-label={mode === "track" ? "Job link" : "Search jobs and commands"}
          placeholder={mode === "track" ? "Paste a job link to track it…" : "Search jobs, views and commands…"}
          value={query}
          inputMode={mode === "track" ? "url" : "search"}
          enterKeyHint="go"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => (setQuery(e.target.value), setError(null))}
        />
        <Dialog.Close className="btn btn-ghost palette-cancel">Cancel</Dialog.Close>
      </div>
      {error && (
        <p className="palette-error" role="alert">
          {error}
        </p>
      )}
      <div className="palette-list" id="palette-list" role="listbox" aria-label="Results">
        {mode === "track" && !isUrl(q) && (
          <div className="palette-note">
            <p>Paste a posting from Greenhouse, Lever, Ashby, or any page with job data. Hunt keeps it whatever your filters say.</p>
            {"clipboard" in navigator && "readText" in navigator.clipboard && (
              <Button
                className="palette-paste"
                icon={<ClipboardPaste size={16} strokeWidth={1.75} />}
                onClick={async () => {
                  try {
                    setQuery((await navigator.clipboard.readText()).trim());
                  } catch {
                    setError("Hunt couldn't read the clipboard. Paste into the field instead.");
                  }
                  input.current?.focus();
                }}
              >
                Paste link
              </Button>
            )}
          </div>
        )}
        {shown.map((c, i) => {
          const head = c.group !== lastGroup ? c.group : null;
          lastGroup = c.group;
          return (
            <div key={c.id} role="presentation">
              {head && (
                <div className="palette-group" role="presentation">
                  {head}
                </div>
              )}
              <div
                id={`cmd-${i}`}
                role="option"
                aria-selected={i === active}
                className="palette-item"
                onPointerMove={() => i !== active && setActive(i)}
                onClick={() => runAt(i)}
              >
                <span className="palette-icon">{busy === c.id ? <Spinner /> : c.icon}</span>
                <span className="palette-label ellipsis">{c.label}</span>
                {c.hint && <span className="palette-hint ellipsis">{c.hint}</span>}
                {c.keys && <Keys k={c.keys} />}
              </div>
            </div>
          );
        })}
        {mode === "all" && q && !shown.length && <p className="palette-note">Nothing matches. Try a company or a job title.</p>}
      </div>
    </div>
  );
}

/** Jobs whose title, company or place match, across every view. */
function useJobSearch(query: string) {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const q = query.trim();
  useEffect(() => {
    if (q.length < 2) return setJobs([]);
    let live = true;
    const t = setTimeout(() => {
      Promise.all(VIEW_ORDER.map((view) => tool("list_jobs", { view, query: q, limit: 4 }))).then(
        (rs) => live && setJobs(rs.flatMap((r) => r.jobs).slice(0, 8)),
        () => live && setJobs([]),
      );
    }, 120);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q]);
  return jobs;
}
