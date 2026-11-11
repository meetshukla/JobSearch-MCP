import type { ReactNode } from "react";
import { Menu } from "@base-ui/react/menu";
import { Drawer } from "@base-ui/react/drawer";

type Side = "top" | "bottom" | "left" | "right";
type Align = "start" | "center" | "end";

/** The floating part of every menu: a portal (so scroll containers can't clip it) and a popup that grows from its trigger. */
export function MenuPopup({ children, side = "bottom", align = "start", className }: { children: ReactNode; side?: Side; align?: Align; className?: string }) {
  return (
    <Menu.Portal>
      <Menu.Positioner className="menu-positioner" side={side} align={align} sideOffset={4} collisionPadding={8}>
        <Menu.Popup className={`menu${className ? ` ${className}` : ""}`}>{children}</Menu.Popup>
      </Menu.Positioner>
    </Menu.Portal>
  );
}

/** A bottom sheet for phones. It follows the finger and dismisses with a downward swipe. */
export function Sheet({ open, onOpenChange, title, children }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; children: ReactNode }) {
  return (
    <Drawer.Root open={open} onOpenChange={(o) => onOpenChange(o)}>
      <Drawer.Portal>
        <Drawer.Backdrop className="sheet-backdrop" />
        <Drawer.Viewport className="sheet-viewport">
          <Drawer.Popup className="sheet">
            <div className="sheet-handle" aria-hidden />
            <Drawer.Title className="sr-only">{title}</Drawer.Title>
            <Drawer.Content className="sheet-content">{children}</Drawer.Content>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
