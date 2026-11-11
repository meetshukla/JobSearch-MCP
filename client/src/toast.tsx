import { Toast } from "@base-ui/react/toast";
import { X } from "lucide-react";

const manager = Toast.createToastManager();

type ToastOptions = { tone?: "default" | "error"; action?: { label: string; run: () => void } };

/** Queue a toast from anywhere. Errors stay longer. An action such as Undo closes the toast when used. */
export function toast(title: string, opts: ToastOptions = {}) {
  const id = manager.add({
    title,
    type: opts.tone ?? "default",
    priority: opts.tone === "error" ? "high" : "low",
    timeout: opts.tone === "error" ? 7000 : opts.action ? 6000 : 3500,
    actionProps: opts.action
      ? {
          children: opts.action.label,
          onClick: () => {
            manager.close(id);
            opts.action!.run();
          },
        }
      : undefined,
  });
  return id;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <Toast.Provider toastManager={manager} limit={3}>
      {children}
      <Toast.Portal>
        <Toast.Viewport className="toasts">
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}

function ToastList() {
  const { toasts } = Toast.useToastManager();
  return toasts.map((t) => (
    <Toast.Root key={t.id} toast={t} className="toast" data-tone={t.type}>
      <Toast.Content className="toast-content">
        <Toast.Title className="toast-title" />
        {t.actionProps && <Toast.Action className="toast-action" />}
        <Toast.Close className="toast-close" aria-label="Dismiss">
          <X size={14} strokeWidth={2} />
        </Toast.Close>
      </Toast.Content>
    </Toast.Root>
  ));
}
