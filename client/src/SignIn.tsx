import { useState, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import { api } from "./api.ts";
import { Mark } from "./App.tsx";
import { Button, Code } from "./ui.tsx";

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
    <div className="gate">
      <form className="gate-card" onSubmit={submit} noValidate>
        <Mark size={32} />
        <h1>Sign in to Hunt</h1>
        <p className="muted">Hunt is yours alone. Use the HUNT_TOKEN secret you set when you deployed it. Your agent connects with the same token.</p>
        <div className="field">
          <label htmlFor="token" className="label">
            Token
          </label>
          <div className={`input-wrap${error ? " invalid" : ""}`}>
            <input
              id="token"
              className="input"
              type={show ? "text" : "password"}
              autoComplete="current-password"
              spellCheck={false}
              placeholder="Paste your HUNT_TOKEN"
              value={token}
              onChange={(e) => (setToken(e.target.value), setError(null))}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "token-error" : undefined}
              autoFocus
            />
            <button type="button" className="input-affix" onClick={() => setShow(!show)} aria-label={show ? "Hide token" : "Show token"}>
              {show ? <EyeOff size={16} strokeWidth={1.75} /> : <Eye size={16} strokeWidth={1.75} />}
            </button>
          </div>
          {error && (
            <p className="field-error" id="token-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <Button type="submit" variant="primary" size="lg" busy={busy} className="gate-submit">
          Sign in
        </Button>
        <p className="gate-foot">
          Lost it? Set a new one with <code className="inline-code">npx wrangler secret put HUNT_TOKEN</code>, then update your agent.
        </p>
      </form>
    </div>
  );
}

export function NeedsToken({ onCheck }: { onCheck: () => void }) {
  return (
    <div className="gate">
      <div className="gate-card gate-wide">
        <Mark size={32} />
        <h1>Set a token to finish setup</h1>
        <p className="muted">This Hunt has no HUNT_TOKEN yet, so nothing can sign in and your agent can't connect. The token is a long random password you keep.</p>
        <ol className="steps">
          <li>
            <span className="step-n">1</span>
            <div>
              <p>Make a token and keep it somewhere safe.</p>
              <Code>openssl rand -hex 24</Code>
            </div>
          </li>
          <li>
            <span className="step-n">2</span>
            <div>
              <p>Save it as a secret on your Worker. Paste the token when asked.</p>
              <Code>npx wrangler secret put HUNT_TOKEN</Code>
            </div>
          </li>
          <li>
            <span className="step-n">3</span>
            <div>
              <p>Come back here and sign in with it.</p>
            </div>
          </li>
        </ol>
        <Button variant="primary" size="lg" onClick={onCheck} className="gate-submit">
          Check again
        </Button>
      </div>
    </div>
  );
}
