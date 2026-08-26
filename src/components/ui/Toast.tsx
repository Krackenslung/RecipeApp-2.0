import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { cx } from '@/utils/cx';

type Tone = 'success' | 'error' | 'info';
type Toast = { id: number; message: string; tone: Tone };

type ToastApi = {
  /** The button that says "Publicar" produces a toast that says "Publicada". */
  toast: (message: string, tone?: Tone) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);

  const toast = useCallback((message: string, tone: Tone = 'info') => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const api = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className={cx(
              'animate-fade-in border px-4 py-2 text-sm shadow-none',
              t.tone === 'success' && 'border-tomatillo bg-tomatillo text-cal',
              t.tone === 'error' && 'border-guajillo bg-guajillo text-cal',
              t.tone === 'info' && 'border-comal bg-comal text-cal',
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
