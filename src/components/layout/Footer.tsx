import { Link } from 'react-router-dom';
import { useHasRole } from '@/queries/useProfile';

export function Footer() {
  const { data: isModerator } = useHasRole('moderator');

  return (
    <footer className="border-t border-ceniza/20 bg-masa">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 text-xs text-ceniza">
        <span className="font-display text-sm font-black tracking-tight text-comal">Recetas</span>
        <span>Cocina mexicana de casa, con ayuda de un modelo.</span>
        <div className="ml-auto flex items-center gap-4">
          <Link to="/" className="transition-colors hover:text-comal">
            Explorar
          </Link>
          <Link to="/generate" className="transition-colors hover:text-comal">
            Generar
          </Link>
          {isModerator && (
            <Link to="/moderation" className="transition-colors hover:text-comal">
              Moderación
            </Link>
          )}
        </div>
      </div>
    </footer>
  );
}
