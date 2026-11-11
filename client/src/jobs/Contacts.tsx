import { useState, type FormEvent } from "react";
import { BadgeCheck, Plus } from "lucide-react";
import type { Contact, JobDetail } from "../../../shared/types.ts";
import type { ContactInput } from "../api.ts";
import { day, initials, todayIso } from "../format.ts";
import { Button, CopyButton, Tip } from "../ui.tsx";
import type { SaveJob } from "./JobDetail.tsx";

export function Contacts({ job, save }: { job: JobDetail; save: SaveJob }) {
  const [adding, setAdding] = useState(false);
  const list = job.contacts_list;
  return (
    <section className="section" aria-labelledby="contacts-title">
      <div className="section-head">
        <h2 id="contacts-title" className="section-title">
          Contacts
          {list.length > 0 && <span className="section-count tnum">{list.length}</span>}
        </h2>
        {!adding && (
          <Button variant="ghost" icon={<Plus size={14} strokeWidth={1.75} />} onClick={() => setAdding(true)}>
            Add
          </Button>
        )}
      </div>
      {list.length > 0 && (
        <ul className="contacts">
          {list.map((c) => (
            <ContactRow key={c.id} c={c} onContacted={() => save({ contacts: [{ name: c.name, linkedin_url: c.linkedin_url, contacted_at: todayIso() }] })} />
          ))}
        </ul>
      )}
      {adding ? (
        <ContactForm onCancel={() => setAdding(false)} onSave={async (c) => (await save({ contacts: [c] })) && setAdding(false)} />
      ) : (
        list.length === 0 && <p className="section-empty">People at the company worth writing to. Your agent can find them with the find-job-contacts skill.</p>
      )}
    </section>
  );
}

function ContactRow({ c, onContacted }: { c: Contact; onContacted: () => void }) {
  return (
    <li className="contact">
      <span className="avatar" aria-hidden>
        {initials(c.name)}
      </span>
      <div className="contact-main">
        <p className="contact-name">
          <span>{c.name}</span>
          {c.title && <span className="contact-title">{c.title}</span>}
        </p>
        {c.email && (
          <p className="contact-email">
            <a href={`mailto:${c.email}`} className="link-quiet">
              {c.email}
            </a>
            {c.email_verified ? (
              <Tip label="Email verified">
                <span className="verified" tabIndex={0} aria-label="Email verified">
                  <BadgeCheck size={14} strokeWidth={1.75} />
                </span>
              </Tip>
            ) : c.email_verified === false ? (
              <span className="t3">unverified</span>
            ) : null}
            <CopyButton text={c.email} label="Copy email" />
          </p>
        )}
        {c.note && <p className="contact-note">{c.note}</p>}
      </div>
      <div className="contact-side">
        {c.linkedin_url && (
          <a className="btn btn-ghost contact-link" href={c.linkedin_url} target="_blank" rel="noopener noreferrer" aria-label={`${c.name} on LinkedIn`}>
            LinkedIn
          </a>
        )}
        {c.contacted_at ? (
          <span className="contacted">Contacted {day(c.contacted_at.slice(0, 10))}</span>
        ) : (
          <Button variant="ghost" onClick={onContacted}>
            Mark contacted
          </Button>
        )}
      </div>
    </li>
  );
}

function ContactForm({ onSave, onCancel }: { onSave: (c: ContactInput) => Promise<unknown>; onCancel: () => void }) {
  const [f, setF] = useState({ name: "", title: "", linkedin_url: "", email: "", email_verified: false, contacted: false });
  const [busy, setBusy] = useState(false);
  const up = (patch: Partial<typeof f>) => setF((cur) => ({ ...cur, ...patch }));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!f.name.trim()) return;
    setBusy(true);
    await onSave({
      name: f.name.trim(),
      title: f.title.trim() || null,
      linkedin_url: f.linkedin_url.trim() || null,
      email: f.email.trim() || null,
      email_verified: f.email.trim() ? f.email_verified : null,
      contacted_at: f.contacted ? todayIso() : null,
    });
    setBusy(false);
  };
  return (
    <form className="contact-form" onSubmit={submit} onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), onCancel())}>
      <div className="form-grid">
        <label className="field">
          <span className="label">Name</span>
          <input className="input" value={f.name} autoComplete="off" onChange={(e) => up({ name: e.target.value })} autoFocus required />
        </label>
        <label className="field">
          <span className="label">Title</span>
          <input className="input" value={f.title} autoComplete="off" placeholder="Engineering manager" onChange={(e) => up({ title: e.target.value })} />
        </label>
        <label className="field">
          <span className="label">LinkedIn</span>
          <input className="input" value={f.linkedin_url} autoComplete="off" spellCheck={false} placeholder="Link or username" onChange={(e) => up({ linkedin_url: e.target.value })} />
        </label>
        <label className="field">
          <span className="label">Email</span>
          <input className="input" type="email" value={f.email} autoComplete="off" spellCheck={false} onChange={(e) => up({ email: e.target.value })} />
        </label>
      </div>
      <div className="checks">
        <label className="check">
          <input type="checkbox" checked={f.email_verified} disabled={!f.email.trim()} onChange={(e) => up({ email_verified: e.target.checked })} />
          Email is verified
        </label>
        <label className="check">
          <input type="checkbox" checked={f.contacted} onChange={(e) => up({ contacted: e.target.checked })} />
          Contacted today
        </label>
      </div>
      <div className="form-actions">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={!f.name.trim()} busy={busy}>
          Add contact
        </Button>
      </div>
    </form>
  );
}
