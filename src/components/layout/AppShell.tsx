import { Outlet, useLocation } from 'react-router-dom';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { cx } from '@/utils/cx';

/** Auth pages get no app chrome — just the card on the canvas. */
const BARE_ROUTES = ['/login', '/signup'];

/**
 * Routes that own their own two-panel layout (results + 500px filter rail).
 * v1 did this with `.app-content:has(.generate-layout){padding:0}`; here it is
 * a flag on the pathname, which is the same decision made somewhere readable.
 */
const FLUSH_ROUTES = ['/', '/generate'];

export function AppShell() {
  const { pathname } = useLocation();

  if (BARE_ROUTES.includes(pathname)) {
    return (
      <div className="min-h-dvh bg-canvas">
        <Outlet />
      </div>
    );
  }

  const flush = FLUSH_ROUTES.includes(pathname);

  return (
    /* h-dvh, not min-h-dvh: a sticky header inside a 60px grid row has no
       travel to stick through. Pinning the grid to the viewport and letting
       <main> be the scroller is what actually holds the chrome in place. */
    <div className="grid h-dvh grid-cols-[240px_1fr] grid-rows-[60px_1fr]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-card focus:bg-ink focus:px-3 focus:py-2 focus:text-surface"
      >
        Saltar al contenido
      </a>

      <Header />

      <aside className="col-start-1 row-start-2 sticky top-[60px] h-[calc(100dvh-60px)] overflow-y-auto border-r border-line bg-surface">
        <Sidebar />
      </aside>

      <main
        id="main"
        className={cx(
          'col-start-2 row-start-2 bg-canvas',
          // Flush routes hand the height to their own panels so each side
          // scrolls on its own; everything else just scrolls here.
          flush ? 'overflow-hidden' : 'overflow-y-auto p-8',
        )}
      >
        <Outlet />
      </main>
    </div>
  );
}
