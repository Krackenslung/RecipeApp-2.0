import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Bookmark, ChefHat, LogOut, Settings, Sparkles, User } from 'lucide-react';
import { useAuth } from '@/context/AuthProvider';
import { useMyProfile } from '@/queries/useProfile';
import { ButtonLink } from '@/components/ui/Button';
import { cx } from '@/utils/cx';

function navClass({ isActive }: { isActive: boolean }) {
  return cx(
    'text-sm transition-colors',
    isActive ? 'text-comal' : 'text-ceniza hover:text-comal',
  );
}

export function Header() {
  const { user, signOut } = useAuth();
  const { data: profile } = useMyProfile();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <header className="border-b border-ceniza/20 bg-masa">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4">
        <Link to="/" className="flex items-center gap-2">
          <ChefHat size={20} className="text-guajillo" aria-hidden />
          <span className="font-display text-lg font-black tracking-tight text-comal">
            Recetas
          </span>
        </Link>

        <nav className="hidden items-center gap-5 sm:flex">
          <NavLink to="/" end className={navClass}>
            Explorar
          </NavLink>
          {user && (
            <>
              <NavLink to="/me" className={navClass}>
                Mis recetas
              </NavLink>
              <NavLink to="/me/collections" className={navClass}>
                Colecciones
              </NavLink>
            </>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {/* guajillo on exactly one thing per screen. This is it in the shell. */}
          <ButtonLink to="/generate" variant="primary" size="sm">
            <Sparkles size={15} aria-hidden />
            Generar
          </ButtonLink>

          {user ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                className="flex h-9 w-9 items-center justify-center overflow-hidden border border-ceniza/30 bg-cal text-ceniza transition-colors hover:border-comal hover:text-comal"
              >
                {profile?.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <User size={16} aria-hidden />
                )}
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 z-40 mt-2 w-52 border border-ceniza/25 bg-cal py-1"
                  onMouseLeave={() => setMenuOpen(false)}
                >
                  <MenuLink to="/me" icon={<User size={15} />} onClick={() => setMenuOpen(false)}>
                    {profile?.display_name ?? profile?.username ?? 'Mi perfil'}
                  </MenuLink>
                  <MenuLink
                    to="/me/saved"
                    icon={<Bookmark size={15} />}
                    onClick={() => setMenuOpen(false)}
                  >
                    Guardadas
                  </MenuLink>
                  <MenuLink
                    to="/settings"
                    icon={<Settings size={15} />}
                    onClick={() => setMenuOpen(false)}
                  >
                    Ajustes
                  </MenuLink>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={async () => {
                      setMenuOpen(false);
                      await signOut();
                      navigate('/');
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ceniza transition-colors hover:bg-masa hover:text-comal"
                  >
                    <LogOut size={15} aria-hidden />
                    Cerrar sesión
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link to="/login" className="text-sm text-ceniza transition-colors hover:text-comal">
              Entrar
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

function MenuLink({
  to,
  icon,
  onClick,
  children,
}: {
  to: string;
  icon: React.ReactNode;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      role="menuitem"
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-2 text-sm text-ceniza transition-colors hover:bg-masa hover:text-comal"
    >
      <span aria-hidden>{icon}</span>
      {children}
    </Link>
  );
}
