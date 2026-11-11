import { useState, type FormEvent, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { api } from "./api.ts";
import { Mark } from "./glyphs.tsx";
import { Button, Code } from "./ui.tsx";

function Gate({ title, children, wide }: { title: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className="gate">
      <div className="gate-col" data-wide={wide || undefined}>
        <Mark size={32} />
        <h1 className="gate-title">{title}</h1>
        {children}
      </div>
    </div>
  );
}

export function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [token, setToken] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return setError("Paste your token first.");
    setBusy(true);
    setError(null);
    try {
      await api.login(token.trim());
      onSignedIn();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <Gate title="Sign in to Hunt">
      <p className="gate-text">Use the HUNT_TOKEN you set when you deployed Hunt. Your agent connects with the same token.</p>
      <form className="gate-form" onSubmit={submit} noValidate>
        <label className="field">
          <span className="label">Token</span>
          <span className="input-affix">
            <input
              className="input"
              type={show ? "text" : "password"}
              autoComplete="current-password"
              spellCheck={false}
              autoCapitalize="none"
              placeholder="Paste your HUNT_TOKEN"
              value={token}
              onChange={(e) => (setToken(e.target.value), setError(null))}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "token-error" : undefined}
              autoFocus
            />
            <button type="button" className="affix-btn" onClick={() => setShow(!show)} aria-label={show ? "Hide token" : "Show token"}>
              {show ? <EyeOff size={16} strokeWidth={1.75} /> : <Eye size={16} strokeWidth={1.75} />}
            </button>
          </span>
          {error && (
            <span className="field-error" id="token-error" role="alert">
              {error}
            </span>
          )}
        </label>
        <Button type="submit" variant="primary" busy={busy} className="gate-submit">
          Sign in
        </Button>
      </form>
      <p className="gate-foot">
        Lost it? Set a new one with <code className="inline-code">npx wrangler secret put HUNT_TOKEN</code>, then update your agent.
      </p>
    </Gate>
  );
}

export function NeedsToken({ onCheck }: { onCheck: () => void }) {
  return (
    <Gate title="Set a token to finish setup" wide>
      <p className="gate-text">This Hunt has no HUNT_TOKEN yet, so nobody can sign in and your agent can't connect. The token is a long random password you keep.</p>
      <ol className="steps">
        <li>
          <p>Make a token and keep it in your password manager.</p>
          <Code>openssl rand -hex 24</Code>
        </li>
        <li>
          <p>Save it as a secret on your Worker, and paste the token when asked.</p>
          <Code>npx wrangler secret put HUNT_TOKEN</Code>
        </li>
        <li>
          <p>Come back here and sign in with it.</p>
        </li>
      </ol>
      <Button variant="primary" onClick={onCheck} className="gate-submit">
        Check again
      </Button>
    </Gate>
  );
}

export function Offline({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Gate title="Can't reach Hunt">
      <p className="gate-text">{message}</p>
      <Button variant="primary" onClick={onRetry} className="gate-submit">
        Try again
      </Button>
    </Gate>
  );
}
