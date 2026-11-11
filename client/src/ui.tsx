import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ButtonHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Check, Copy, X } from "lucide-react";
import type { Status } from "../../shared/types.ts";
import { STATUS, scoreTone } from "./format.ts";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  icon?: ReactNode;
  busy?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", icon, busy, children, className, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`btn btn-${variant} btn-${size}${icon && children ? " has-icon" : ""}${!children ? " icon-only" : ""}${className ? ` ${className}` : ""}`}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy ? <Spinner /> : icon}
      {children}
    </button>
  );
});

export const Spinner = () => <span className="spinner" aria-hidden />;

export function Switch({ checked, onChange, label, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; id?: string }) {
  return (
    <button type="button" role="switch" id={id} aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)}>
      <span className="switch-thumb" />
    </button>
  );
}

export function ScoreBadge({ score, size = "sm" }: { score: number; size?: "sm" | "lg" }) {
  return (
    <span className={`score score-${scoreTone(score)} score-${size}`} title={`Verdict ${score}/100`}>
      {score}
    </span>
  );
}

export function StatusChip({ status }: { status: Status }) {
  return (
    <span className={`status status-${STATUS[status].tone}`}>
      <span className="status-dot" />
      {STATUS[status].label}
    </span>
  );
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      {icon && <div className="empty-icon">{icon}</div>}
      <p className="empty-title">{title}</p>
      {children && <p className="empty-text">{children}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(false), 1400);
    return () => clearTimeout(t);
  }, [done]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
    } catch {
      toast("Couldn't copy. Select the text and copy it by hand.", "error");
    }
  };
  return (
    <button type="button" className="copy-btn" onClick={copy} aria-label={done ? "Copied" : label} title={done ? "Copied" : label}>
      <span className="icon-swap" data-state={done ? "b" : "a"}>
        <Copy size={14} strokeWidth={1.75} className="icon-a" />
        <Check size={14} strokeWidth={2} className="icon-b" />
      </span>
    </button>
  );
}

export function Code({ children, label }: { children: string; label?: string }) {
  return (
    <div className="code">
      {label && <div className="code-label">{label}</div>}
      <pre>
        <code>{children}</code>
      </pre>
      <CopyButton text={children} />
    </div>
  );
}

/** Comma or Enter adds a chip, Backspace on an empty field removes the last one. Pasting a list adds each line. */
export function ChipInput({ value, onChange, placeholder, id, label }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string; id?: string; label: string }) {
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const add = (raw: string) => {
    const items = raw.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
    if (!items.length) return;
    const lower = new Set(value.map((v) => v.toLowerCase()));
    onChange([...value, ...items.filter((i) => !lower.has(i.toLowerCase()) && lower.add(i.toLowerCase()))]);
    setDraft("");
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };
  return (
    <div className="chips" onClick={() => input.current?.focus()}>
      {value.map((v) => (
        <span className="chip" key={v}>
          {v}
          <button type="button" aria-label={`Remove ${v}`} onClick={(e) => (e.stopPropagation(), onChange(value.filter((x) => x !== v)))}>
            <X size={12} strokeWidth={2} />
          </button>
        </span>
      ))}
      <input
        ref={input}
        id={id}
        aria-label={label}
        value={draft}
        placeholder={value.length ? "" : placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        onBlur={() => add(draft)}
        onPaste={(e) => {
          const text = e.clipboardData.getData("text");
          if (/[\n,]/.test(text)) {
            e.preventDefault();
            add(text);
          }
        }}
      />
    </div>
  );
}

/** A two-step destructive button: the first press arms it, the second confirms. */
export function ConfirmButton({ onConfirm, children, confirmLabel, icon, label, size = "sm" }: { onConfirm: () => void; children?: ReactNode; confirmLabel: string; icon?: ReactNode; label?: string; size?: "sm" | "md" }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return armed ? (
    <Button size={size} variant="danger" onClick={() => (setArmed(false), onConfirm())} autoFocus>
      {confirmLabel}
    </Button>
  ) : (
    <Button size={size} variant="ghost" icon={icon} onClick={() => setArmed(true)} aria-label={label} title={label}>
      {children}
    </Button>
  );
}

type Toast = { id: number; text: string; tone: "default" | "error" };
let toasts: Toast[] = [];
let nextToast = 1;
const toastListeners = new Set<() => void>();
const emit = () => toastListeners.forEach((l) => l());

export function toast(text: string, tone: Toast["tone"] = "default") {
  const t = { id: nextToast++, text, tone };
  toasts = [...toasts.slice(-2), t];
  emit();
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id);
    emit();
  }, tone === "error" ? 6000 : 3200);
}

export function Toasts() {
  const list = useSyncExternalStore(
    (l) => (toastListeners.add(l), () => toastListeners.delete(l)),
    () => toasts,
  );
  return (
    <div className="toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`toast toast-${t.tone}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
