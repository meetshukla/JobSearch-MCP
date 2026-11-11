import { useEffect, useRef, useState } from "react";
import { tool } from "../api.ts";
import { bump } from "../live.ts";
import { Button, Keys } from "../ui.tsx";
import { toast } from "../toast.tsx";
import { PageHead } from "./SettingsView.tsx";

const MAX = 60_000;

export function Profile({ saved }: { saved: string }) {
  const [draft, setDraft] = useState(saved);
  const [busy, setBusy] = useState(false);
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
      bump(["settings"]);
      toast("Profile saved");
    } catch (e) {
      toast((e as Error).message, { tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead title="Profile">Your resume, and what you want and won't accept. Hunt keeps it for your agent to judge fit, and does nothing else with it. Plain text or Markdown.</PageHead>
      <textarea
        className="textarea profile-input"
        value={draft}
        maxLength={MAX}
        spellCheck
        aria-label="Profile"
        placeholder={"# Your name\nWhat you do, years of experience, the stack you know.\n\n## Want\n- Roles, seniority, team size, salary floor\n\n## Won't accept\n- Relocation, on-call, industries you avoid"}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "s" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            save();
          }
        }}
      />
      <div className="save-bar">
        <span className="save-state" data-dirty={dirty || undefined}>
          {dirty ? "Unsaved changes" : draft.trim() ? "Saved" : "Empty"}
        </span>
        <span className="t3 tnum">{draft.length.toLocaleString()} characters</span>
        <div className="save-actions">
          <Keys k="⌘ S" />
          <Button variant="primary" onClick={save} disabled={!dirty} busy={busy}>
            Save profile
          </Button>
        </div>
      </div>
    </>
  );
}
