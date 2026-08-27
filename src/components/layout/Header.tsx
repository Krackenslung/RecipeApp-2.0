import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CircleUserRound, LogOut, Settings, User } from 'lucide-react';
import { useAuth } from '@/context/AuthProvider';
import { useMyProfile } from '@/queries/useProfile';
import { Button } from '@/components/ui/Button';
import logo from '@/assets/recipes_powered_by_gemini_logo.png';

/**
 * Logo on the left, who you are on the right. The nav links live in the
 * Sidebar now; only the profile menu stayed behind.
 */
export function Header() {
  const { user, signOut } = useAuth();
  const { data: profile } = useMyProfile();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();

  const name = profile?.display_name ?? profile?.username ?? 'My profile';

  return (
    <header className="col-span-full row-start-1 sticky top-0 z-50 flex items-center justify-between border-b border-line bg-surface px-6">
      <Link to="/" className="flex items-center gap-2 no-underline">
        <img src={logo} alt="Recipes powered by Gemini" className="h-9" />
      </Link>

      {user ? (
        <div className="flex items-center gap-2.5 text-body">
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              // The name is hidden below sm, so the trigger needs a name of
              // its own or it reads as an unlabelled button on a phone.
              aria-label={`${name} menu`}
              className="flex items-center gap-2 rounded-card px-2 py-1.5 text-sm text-body transition-colors hover:bg-hairline hover:text-ink"
            >
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt=""
                  className="h-6 w-6 rounded-full object-cover"
                />
              ) : (
                <CircleUserRound size={20} aria-hidden />
              )}
              <span className="hidden sm:inline">{name}</span>
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 z-40 mt-2 w-52 rounded-card border border-line-strong bg-surface py-1"
                onMouseLeave={() => setMenuOpen(false)}
              >
                <MenuLink to="/me" icon={<User size={16} />} onClick={() => setMenuOpen(false)}>
                  {name}
                </MenuLink>
                <MenuLink
                  to="/settings"
                  icon={<Settings size={16} />}
                  onClick={() => setMenuOpen(false)}
                >
                  Settings
                </MenuLink>
              </div>
            )}
          </div>

          <Button
            variant="danger"
            size="sm"
            onClick={async () => {
              setMenuOpen(false);
              await signOut();
              navigate('/');
            }}
          >
            <LogOut size={16} aria-hidden />
            Sign out
          </Button>
        </div>
      ) : (
        <Link
          to="/login"
          className="text-sm text-body no-underline transition-colors hover:text-ink"
        >
          Sign in
        </Link>
      )}
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
      className="flex items-center gap-2 px-3 py-2 text-sm text-body no-underline transition-colors hover:bg-hairline hover:text-ink"
    >
      <span aria-hidden>{icon}</span>
      {children}
    </Link>
  );
}
