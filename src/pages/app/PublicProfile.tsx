import { useEffect, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { RecipeCard } from '@/components/recipe/RecipeCard';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, SkeletonGrid } from '@/components/ui/states';
import { flattenPages, useRecipeSearch } from '@/queries/useRecipeSearch';
import {
  useFollowCounts,
  useIsFollowing,
  useProfileByUsername,
  useToggleFollow,
} from '@/queries/useProfile';
import { useUserCollections } from '@/queries/useCollections';
import { useAuth } from '@/context/AuthProvider';
import { EMPTY_FILTERS } from '@/utils/filterArgs';

export default function PublicProfile() {
  const { username } = useParams<{ username: string }>();
  const { data: profile, isLoading, isError, error, refetch } = useProfileByUsername(username);
  const { user } = useAuth();

  const query = useRecipeSearch(EMPTY_FILTERS, profile?.id);
  const recipes = flattenPages(query.data?.pages);
  const { data: counts } = useFollowCounts(profile?.id);
  const { data: following } = useIsFollowing(profile?.id);
  const toggleFollow = useToggleFollow(profile?.id ?? '');
  const { data: collections } = useUserCollections(profile?.id);

  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && query.hasNextPage && !query.isFetchingNextPage) {
        void query.fetchNextPage();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [query]);

  if (isLoading) return <SkeletonGrid />;

  if (isError) {
    const notFound = error instanceof Error && error.message === 'NOT_FOUND';
    return notFound ? (
      <EmptyState title="We couldn’t find that person" />
    ) : (
      <ErrorState onRetry={() => void refetch()} />
    );
  }

  if (!profile) return null;
  const isSelf = user?.id === profile.id;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-start gap-5">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full border border-line-strong bg-surface">
          {profile.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-3xl font-semibold text-muted">
              {(profile.display_name ?? profile.username).slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-2">
          <h1 className="text-3xl font-semibold text-ink">
            {profile.display_name ?? profile.username}
          </h1>
          <p className="font-mono text-sm text-body">@{profile.username}</p>
          {profile.bio && <p className="max-w-xl text-sm text-ink">{profile.bio}</p>}

          <dl className="flex gap-5 font-mono text-xs text-body">
            <div className="flex gap-1">
              <dt>Followers</dt>
              <dd className="text-ink">{counts?.followers ?? '—'}</dd>
            </div>
            <div className="flex gap-1">
              <dt>Following</dt>
              <dd className="text-ink">{counts?.following ?? '—'}</dd>
            </div>
          </dl>
        </div>

        {user && !isSelf && (
          <Button
            variant={following ? 'secondary' : 'primary'}
            size="sm"
            loading={toggleFollow.isPending}
            onClick={() => toggleFollow.mutate(Boolean(following))}
          >
            {following ? 'Following' : 'Follow'}
          </Button>
        )}
      </header>

      {collections && collections.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold text-ink">Collections</h2>
          <ul className="flex flex-wrap gap-2">
            {collections.map((c) => (
              <li key={c.collection_id}>
                <Link
                  to={`/c/${c.collection_id}`}
                  className="inline-flex rounded-card border border-line-strong px-3 py-1.5 text-sm text-body no-underline transition-colors hover:bg-hairline hover:text-ink"
                >
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold text-ink">Recipes</h2>

        {query.isLoading ? (
          <SkeletonGrid />
        ) : recipes.length === 0 ? (
          <EmptyState title="Nothing published yet" />
        ) : (
          <>
            <div className="grid animate-fade-in grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {recipes.map((r) => (
                <RecipeCard key={r.recipe_id} recipe={r} />
              ))}
            </div>
            <div ref={sentinel} className="h-12" aria-hidden />
          </>
        )}
      </section>
    </div>
  );
}
