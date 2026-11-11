import { useEffect, useRef, useState } from "react";
import { tool } from "../api.ts";
import { bump } from "../live.ts";
import { Button, toast } from "../ui.tsx";
import { SectionHead } from "./SetupPage.tsx";

const MAX = 60_000;

export function Profile({ saved }: { saved: string }) {
  const [draft, setDraft] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const base = useRef(saved);
  const dirty = draft !== base.current;

  // Your agent can rewrite the profile too. Take its version unless you're mid-edit.
  useEffect(() => {
    if (!dirty) setDraft(saved);
    base.current = saved;
  }, [saved]);

  const save = async () => {
    if (!dirty || busy) return;
    setBusy(true);
    try {
      await tool("update_settings", { profile: draft });
      base.current = draft;
      setJustSaved(true);
      bump(["settings"]);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!justSaved) return;
    const t = setTimeout(() => setJustSaved(false), 2000);
    return () => clearTimeout(t);
  }, [justSaved]);

  return (
    <div className="section">
      <SectionHead title="Profile">
        Your resume, and what you want and won't accept. Hunt stores it for your agent to judge fit; it doesn't read it itself. Plain text or Markdown.
      </SectionHead>
      <textarea
        className="profile-input"
        value={draft}
        maxLength={MAX}
        spellCheck
        aria-label="Profile"
        placeholder={"# Your name\nWhat you do, years of experience, the stack you know.\n\n## Want\n- Roles, seniority, team size, salary floor\n\n## Won't accept\n- Relocation, on-call, industries you avoid"}
        onChange={(e) => (setDraft(e.target.value), setJustSaved(false))}
        onKeyDown={(e) => {
          if (e.key === "s" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            save();
          }
        }}
      />
      <div className="save-bar">
        <span className="save-state" data-state={dirty ? "dirty" : justSaved ? "saved" : "idle"}>
          {dirty ? "Unsaved changes" : justSaved ? "Saved" : draft.trim() ? "Saved" : "Empty"}
        </span>
        <span className="muted tnum">{draft.length.toLocaleString()} characters</span>
        <Button variant="primary" onClick={save} disabled={!dirty} busy={busy} className="push-end">
          Save profile
        </Button>
      </div>
    </div>
  );
}
