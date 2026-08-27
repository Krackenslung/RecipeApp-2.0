import { useEffect, type ReactNode, type RefObject } from 'react';
import { X } from 'lucide-react';

type Props = {
  dialogRef: RefObject<HTMLDialogElement | null>;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
};

/**
 * Native <dialog>. showModal() is what gives focus trapping, Escape-to-close and
 * the top layer; this component only supplies the chrome and keeps React's
 * `open` state honest when the browser closes the dialog on Escape.
 */
export function Dialog({ dialogRef, title, onClose, children, footer }: Props) {
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const handleClose = () => onClose();
    el.addEventListener('close', handleClose);
    return () => el.removeEventListener('close', handleClose);
  }, [dialogRef, onClose]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="dialog-title"
      className="w-[min(32rem,calc(100vw-2rem))] backdrop:backdrop-blur-[1px]"
      onClick={(e) => {
        // Clicking the backdrop lands on the dialog element itself.
        if (e.target === dialogRef.current) dialogRef.current?.close();
      }}
    >
      <div className="overflow-hidden rounded-card border border-line-strong bg-surface">
        <header className="flex items-start justify-between gap-4 border-b border-hairline px-5 py-4">
          <h2 id="dialog-title" className="text-lg font-semibold text-ink">
            {title}
          </h2>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label="Close"
            className="text-muted transition-colors hover:text-ink"
          >
            <X size={18} aria-hidden />
          </button>
        </header>

        <div className="px-5 py-4 text-sm text-body">{children}</div>

        {footer && (
          <footer className="flex justify-end gap-2 border-t border-hairline px-5 py-3">
            {footer}
          </footer>
        )}
      </div>
    </dialog>
  );
}
