import { forwardRef, useEffect, useRef, useState, type ButtonHTMLAttributes, type KeyboardEvent, type ReactElement, type ReactNode } from "react";
import { Check, Copy, X } from "lucide-react";
import { Switch as BaseSwitch } from "@base-ui/react/switch";
import { Tooltip } from "@base-ui/react/tooltip";
import { toast } from "./toast.tsx";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  icon?: ReactNode;
  busy?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", icon, busy, children, className, disabled, type = "button", ...rest },
  ref,
) {
  const shape = !children ? " icon-only" : icon ? " has-icon" : "";
  return (
    <button ref={ref} type={type} className={`btn btn-${variant}${shape}${className ? ` ${className}` : ""}`} disabled={disabled || busy} aria-busy={busy || undefined} {...rest}>
      {busy ? <Spinner /> : icon}
      {children}
    </button>
  );
});

export const Spinner = () => <span className="spinner" aria-hidden />;

/** Shortcut legend: <Keys k="⌘ K" />. Hidden on touch screens. */
export function Keys({ k }: { k: string }) {
  return (
    <span className="kbds" aria-hidden>
      {k.split(" ").map((key) => (
        <kbd key={key} className="kbd">
          {key}
        </kbd>
      ))}
    </span>
  );
}

/** A tooltip for pointer users. Touch users get the same text from the control's aria-label. */
export function Tip({ label, keys, children, side = "bottom" }: { label: string; keys?: string; children: ReactElement; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger render={children} />
      <Tooltip.Portal>
        <Tooltip.Positioner side={side} sideOffset={6} className="tip-positioner">
          <Tooltip.Popup className="tip">
            {label}
            {keys && <Keys k={keys} />}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export const TipProvider = Tooltip.Provider;

type IconButtonProps = Omit<ButtonProps, "children" | "icon"> & { icon: ReactNode; label: string; keys?: string; tipSide?: "top" | "bottom" | "left" | "right" };

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton({ icon, label, keys, tipSide, variant = "ghost", ...rest }, ref) {
  return (
    <Tip label={label} keys={keys} side={tipSide}>
      <Button ref={ref} variant={variant} icon={icon} aria-label={label} {...rest} />
    </Tip>
  );
});

export function Switch({ checked, onChange, id, disabled }: { checked: boolean; onChange: (v: boolean) => void; id?: string; disabled?: boolean }) {
  return (
    <BaseSwitch.Root id={id} className="switch" checked={checked} disabled={disabled} onCheckedChange={(v) => onChange(v)}>
      <BaseSwitch.Thumb className="switch-thumb" />
    </BaseSwitch.Root>
  );
}

/** A small radio group drawn as one control. Arrow keys move between options. */
export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o, i) => (
        <button
          key={o.value}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          tabIndex={o.value === value ? 0 : -1}
          className="segment"
          onClick={() => onChange(o.value)}
          onKeyDown={(e) => onKey(e, i)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Phrases edited in place. Enter or a comma adds one. Backspace on an empty field removes the last. Pasting a list adds each line. */
export function TokenField({ value, onChange, placeholder, id, label, disabled }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string; id?: string; label: string; disabled?: boolean }) {
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const add = (raw: string) => {
    const items = raw.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
    if (!items.length) return;
    const seen = new Set(value.map((v) => v.toLowerCase()));
    const fresh = items.filter((i) => !seen.has(i.toLowerCase()) && seen.add(i.toLowerCase()));
    if (fresh.length) onChange([...value, ...fresh]);
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
    <div className="tokens" data-disabled={disabled || undefined} onClick={() => input.current?.focus()}>
      {value.map((v) => (
        <span className="token" key={v}>
          <span>{v}</span>
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
        disabled={disabled}
        autoComplete="off"
        placeholder={value.length ? "Add…" : placeholder}
        enterKeyHint="enter"
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
      toast("Couldn't copy. Select the text and copy it by hand.", { tone: "error" });
    }
  };
  return (
    <IconButton
      className="copy"
      label={done ? "Copied" : label}
      onClick={copy}
      icon={
        <span className="swap" data-on={done || undefined}>
          <Copy size={14} strokeWidth={1.75} />
          <Check size={14} strokeWidth={2} />
        </span>
      }
    />
  );
}

export function Code({ children }: { children: string }) {
  return (
    <div className="code">
      <pre>
        <code>{children}</code>
      </pre>
      <CopyButton text={children} label="Copy command" />
    </div>
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

export function useMedia(query: string) {
  const [match, setMatch] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const m = matchMedia(query);
    const on = () => setMatch(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [query]);
  return match;
}

export const PHONE = "(max-width: 767px)";
export const SPLIT = "(min-width: 1240px)";

export const typing = (el: Element | null) => el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

/** Keyboard shortcuts stay quiet while a menu, dialog or field has focus. */
export function shortcutBlocked(e: globalThis.KeyboardEvent) {
  if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return true;
  const el = document.activeElement;
  if (typing(el)) return true;
  return Boolean(el?.closest('[role="menu"],[role="dialog"],[role="alertdialog"],[role="listbox"]')) || Boolean(document.querySelector('[role="dialog"][data-open],[role="alertdialog"][data-open],[role="menu"][data-open]'));
}
