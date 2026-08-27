import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Bookmark,
  History,
  Home,
  Library,
  Settings,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '@/context/AuthProvider';
import { useHasRole } from '@/queries/useProfile';
import { cx } from '@/utils/cx';

/**
 * The nav that used to sit across the header. It is a column now — the v1 grid
 * gives it a 240px lane of its own and the active item is the pale rose pill.
 */
export function Sidebar() {
  const { user } = useAuth();
  const { data: isModerator } = useHasRole('moderator');

  return (
    <nav aria-label="Main" className="flex flex-col gap-1 p-3">
      <Item to="/" end icon={<Home size={20} aria-hidden />}>
        Home
      </Item>
      <Item to="/generate" icon={<Sparkles size={20} aria-hidden />}>
        Generate recipe
      </Item>

      {user && (
        <>
          <Item to="/me" icon={<History size={20} aria-hidden />}>
            History
          </Item>
          <Item to="/me/collections" icon={<Library size={20} aria-hidden />}>
            Collections
          </Item>
          <Item to="/me/saved" icon={<Bookmark size={20} aria-hidden />}>
            Saved
          </Item>
          <Item to="/settings" icon={<Settings size={20} aria-hidden />}>
            Settings
          </Item>
        </>
      )}

      {isModerator && (
        <Item to="/moderation" icon={<ShieldCheck size={20} aria-hidden />}>
          Moderation
        </Item>
      )}
    </nav>
  );
}

function Item({
  to,
  end,
  icon,
  children,
}: {
  to: string;
  end?: boolean;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cx(
          'flex items-center gap-2 rounded-card px-4 py-2.5 text-sm no-underline transition-colors',
          isActive ? 'bg-brand-soft text-brand' : 'text-body hover:bg-hairline hover:text-ink',
        )
      }
    >
      {icon}
      {children}
    </NavLink>
  );
}
