import type { ReactNode } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { useDialog } from '@/hooks/useDialog';

type Props = {
  /** The scrolling results column. */
  children: ReactNode;
  /** The 500px rail. Rendered twice — inline on desktop, in the dialog below lg. */
  filters: ReactNode;
  /** Pinned under the results column. v1's "footer" area. */
  footer?: ReactNode;
};

/**
 * v1's `.generate-layout`: results on the left, a 500px filter rail on the
 * right, each side scrolling on its own. Below lg the rail collapses into a
 * dialog — a 500px column has nowhere to go on a phone.
 */
export function TwoPaneLayout({ children, filters, footer }: Props) {
  const dialog = useDialog();

  return (
    <div className="grid h-full grid-cols-1 grid-rows-[1fr_auto] lg:grid-cols-[1fr_500px]">
      <div className="col-start-1 row-start-1 overflow-y-auto p-6 lg:p-12">
        <div className="mb-4 flex justify-end lg:hidden">
          <Button size="sm" variant="secondary" onClick={dialog.show}>
            <SlidersHorizontal size={16} aria-hidden />
            Filters
          </Button>
        </div>
        {children}
      </div>

      {footer && (
        <div className="col-start-1 row-start-2 border-t border-line bg-surface px-6 py-4 lg:px-12">
          {footer}
        </div>
      )}

      <aside
        aria-label="Filters"
        className="hidden lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:block lg:w-[500px] lg:overflow-y-auto lg:border-l lg:border-line lg:bg-surface lg:px-3 lg:py-4"
      >
        {filters}
      </aside>

      {/* Mounted always so showModal() has an element; filled only when open,
          so the rail is never live in two places at once. */}
      <Dialog dialogRef={dialog.ref} title="Filters" onClose={dialog.close}>
        {dialog.open ? filters : null}
      </Dialog>
    </div>
  );
}
