import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { Footer } from './Footer';

export function AppShell() {
  return (
    <div className="flex min-h-dvh flex-col bg-masa">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-comal focus:px-3 focus:py-2 focus:text-cal"
      >
        Saltar al contenido
      </a>
      <Header />
      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
