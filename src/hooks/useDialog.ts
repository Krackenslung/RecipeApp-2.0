import { useCallback, useRef, useState } from 'react';

/**
 * Drives a native <dialog>. showModal() gives focus trapping, Escape-to-close
 * and the top layer for free — which is the whole reason SweetAlert2 is gone.
 */
export function useDialog() {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  const show = useCallback(() => {
    ref.current?.showModal();
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    ref.current?.close();
    setOpen(false);
  }, []);

  return { ref, open, show, close };
}
