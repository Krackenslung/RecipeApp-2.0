import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { RequireAnon, RequireAuth, RequireRole } from './RequireAuth';
import { Spinner } from '@/components/ui/states';
import NotFound from '@/pages/app/NotFound';

const Feed = lazy(() => import('@/pages/app/Feed'));
const RecipeDetail = lazy(() => import('@/pages/app/RecipeDetail'));
const RecipeEditor = lazy(() => import('@/pages/app/RecipeEditor'));
const Generate = lazy(() => import('@/pages/app/Generate'));
const MyRecipes = lazy(() => import('@/pages/app/MyRecipes'));
const SavedRecipes = lazy(() => import('@/pages/app/SavedRecipes'));
const Collections = lazy(() => import('@/pages/app/Collections'));
const CollectionDetail = lazy(() => import('@/pages/app/CollectionDetail'));
const PublicProfile = lazy(() => import('@/pages/app/PublicProfile'));
const Settings = lazy(() => import('@/pages/app/Settings'));
const Moderation = lazy(() => import('@/pages/app/Moderation'));
const Login = lazy(() => import('@/pages/auth/Login'));
const Signup = lazy(() => import('@/pages/auth/Signup'));
const AuthCallback = lazy(() => import('@/pages/auth/AuthCallback'));

function page(node: ReactNode) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-64 items-center justify-center">
          <Spinner className="h-6 w-6" />
        </div>
      }
    >
      {node}
    </Suspense>
  );
}

/**
 * Public routes render for `anon` — RLS already limits what comes back, so an
 * anonymous visitor browsing the feed is a supported state, not a bug.
 *
 * Auth is a layout route, never a check inside a page body.
 */
export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: '/', element: page(<Feed />) },
      { path: '/r/:slug', element: page(<RecipeDetail />) },
      { path: '/u/:username', element: page(<PublicProfile />) },
      { path: '/c/:id', element: page(<CollectionDetail />) },
      { path: '/auth/callback', element: page(<AuthCallback />) },

      {
        element: <RequireAnon />,
        children: [
          { path: '/login', element: page(<Login />) },
          { path: '/signup', element: page(<Signup />) },
        ],
      },

      {
        element: <RequireAuth />,
        children: [
          { path: '/generate', element: page(<Generate />) },
          // Not in the original route table, but build order step 7 calls for
          // recipe edit — the detail page links here for the author.
          { path: '/r/:slug/edit', element: page(<RecipeEditor />) },
          { path: '/me', element: page(<MyRecipes />) },
          { path: '/me/saved', element: page(<SavedRecipes />) },
          { path: '/me/collections', element: page(<Collections />) },
          { path: '/settings', element: page(<Settings />) },
        ],
      },

      {
        element: <RequireRole code="moderator" />,
        children: [{ path: '/moderation', element: page(<Moderation />) }],
      },

      { path: '*', element: <NotFound /> },
    ],
  },
]);
