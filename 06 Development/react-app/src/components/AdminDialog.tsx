import { useEffect, useRef } from "react";

type AdminDialogProps = {
  labelledBy: string;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  closeDisabled?: boolean;
};

export function AdminDialog({ labelledBy, onClose, children, className = "", closeDisabled = false }: AdminDialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const closeDisabledRef = useRef(closeDisabled);
  onCloseRef.current = onClose;
  closeDisabledRef.current = closeDisabled;

  useEffect(() => {
    if (!returnFocusRef.current) returnFocusRef.current = document.activeElement as HTMLElement | null;
    const previousBodyOverflow = document.body.style.overflow;
    const overlay = overlayRef.current;
    document.body.style.overflow = "hidden";

    const focusable = () => [...(overlay?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    ) ?? [])].filter((node) => !node.hasAttribute("hidden"));

    window.requestAnimationFrame(() => focusable()[0]?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      const dialogs = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')];
      if (dialogs.at(-1) !== overlay) return;
      if (event.key === "Escape") {
        if (!closeDisabledRef.current) {
          event.preventDefault();
          onCloseRef.current();
        }
        return;
      }
      if (event.key !== "Tab") return;
      const nodes = focusable();
      if (!nodes.length) {
        event.preventDefault();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      window.requestAnimationFrame(() => returnFocusRef.current?.focus());
    };
  }, []);

  return <div ref={overlayRef} className="admin-overlay" role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
    <section className={`admin-dialog ${className}`.trim()}>{children}</section>
  </div>;
}
