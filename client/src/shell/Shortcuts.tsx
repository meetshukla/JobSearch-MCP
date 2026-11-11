import { useRef } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { Keys } from "../ui.tsx";

const GROUPS: { title: string; keys: [string, string][] }[] = [
  {
    title: "Anywhere",
    keys: [
      ["⌘ K", "Search and commands"],
      ["T", "Track a job from a link"],
      ["?", "Show shortcuts"],
    ],
  },
  {
    title: "Lists",
    keys: [
      ["J", "Next job"],
      ["K", "Previous job"],
      ["↵", "Open job"],
      ["/", "Search this view"],
    ],
  },
  {
    title: "Open job",
    keys: [
      ["S", "Change status"],
      ["O", "Open the posting"],
      ["N", "Write a note"],
      ["Esc", "Close"],
    ],
  },
];

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const popup = useRef<HTMLDivElement>(null);
  return (
    <Dialog.Root open={open} onOpenChange={(o) => onOpenChange(o)}>
      <Dialog.Portal>
        <Dialog.Backdrop className="scrim" />
        <Dialog.Popup ref={popup} initialFocus={popup} className="dialog shortcuts">
          <header className="dialog-head">
            <Dialog.Title className="dialog-title">Keyboard shortcuts</Dialog.Title>
            <Dialog.Close className="btn btn-ghost icon-only" aria-label="Close">
              <X size={16} strokeWidth={1.75} />
            </Dialog.Close>
          </header>
          <div className="shortcut-groups">
            {GROUPS.map((g) => (
              <section key={g.title}>
                <h3 className="shortcut-title">{g.title}</h3>
                <dl className="shortcut-list">
                  {g.keys.map(([k, label]) => (
                    <div key={k} className="shortcut">
                      <dt>{label}</dt>
                      <dd>
                        <Keys k={k} />
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
