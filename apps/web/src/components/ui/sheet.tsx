import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A minimal, non-modal side sheet (no external deps). Slides in from the right
 * and overlays the edge WITHOUT a backdrop, so the cockpit stays visible and
 * keeps streaming behind it — and opening/closing never shifts the layout.
 * Esc closes it; there is no click-outside scrim by design.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const titleId = React.useId();
  const panelRef = React.useRef<HTMLDivElement>(null);

  // Stable ref so the effect depends only on `open` (see Dialog for rationale).
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-labelledby={titleId}
      tabIndex={-1}
      className={cn(
        "fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l bg-card text-card-foreground shadow-2xl focus:outline-none",
        "duration-200 animate-in slide-in-from-right",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2 border-b px-3 py-2">
        <div className="min-w-0">
          <h2 id={titleId} className="flex items-center gap-2 text-sm font-medium">
            {title}
          </h2>
          {description && (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        <button
          type="button"
          aria-label="Close panel"
          onClick={onClose}
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin p-3">{children}</div>
    </div>
  );
}
