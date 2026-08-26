import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { appDb, socialDb, unwrap, unwrapMaybe } from '@/lib/supabase';
import { useAuth } from '@/context/AuthProvider';
import type { Database } from '@/types/database';

export type Profile = Database['app']['Tables']['profiles']['Row'];

export function useMyProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['profile', 'me', user?.id ?? null],
    enabled: Boolean(user),
    queryFn: async (): Promise<Profile | null> =>
      unwrapMaybe(await appDb.from('profiles').select('*').eq('id', user!.id).maybeSingle()),
  });
}

export function useProfileByUsername(username: string | undefined) {
  return useQuery({
    queryKey: ['profile', 'byUsername', username],
    enabled: Boolean(username),
    queryFn: async (): Promise<Profile> => {
      const row = unwrapMaybe(
        await appDb
          .from('profiles')
          .select('*')
          .eq('username', username!)
          .is('deleted_at', null)
          .maybeSingle(),
      );
      if (!row) throw new Error('NOT_FOUND');
      return row;
    },
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (patch: Database['app']['Tables']['profiles']['Update']) =>
      unwrap(await appDb.from('profiles').update(patch).eq('id', user!.id).select('*').single()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile'] }),
  });
}

/** Drives /moderation's route guard. app.has_role() is the same check the policies use. */
export function useHasRole(code: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['role', code, user?.id ?? null],
    enabled: Boolean(user),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<boolean> =>
      unwrap(await appDb.rpc('has_role', { check_code: code })),
  });
}

// --- Diet and allergen preferences -----------------------------------------
// These seed the sidebar on sign-in. Visibly pre-filled, never silently applied.

export function useDietPreferences() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['preferences', 'diets', user?.id ?? null],
    enabled: Boolean(user),
    queryFn: async (): Promise<number[]> => {
      const rows = unwrap(await socialDb.from('user_diet_preferences').select('diet_id'));
      return rows.map((r) => r.diet_id);
    },
  });
}

export function useAllergenPreferences() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['preferences', 'allergens', user?.id ?? null],
    enabled: Boolean(user),
    queryFn: async (): Promise<number[]> => {
      const rows = unwrap(await socialDb.from('user_allergen_preferences').select('allergen_id'));
      return rows.map((r) => r.allergen_id);
    },
  });
}

/** Replace-in-full: the preference set is small and the UI edits it as a whole. */
export function useSaveDietPreferences() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (dietIds: number[]) => {
      unwrap(
        await socialDb
          .from('user_diet_preferences')
          .delete()
          .eq('user_id', user!.id)
          .select('diet_id'),
      );
      if (dietIds.length) {
        unwrap(
          await socialDb
            .from('user_diet_preferences')
            .insert(dietIds.map((diet_id) => ({ diet_id })))
            .select('diet_id'),
        );
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['preferences', 'diets'] }),
  });
}

export function useSaveAllergenPreferences() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (allergenIds: number[]) => {
      unwrap(
        await socialDb
          .from('user_allergen_preferences')
          .delete()
          .eq('user_id', user!.id)
          .select('allergen_id'),
      );
      if (allergenIds.length) {
        unwrap(
          await socialDb
            .from('user_allergen_preferences')
            .insert(allergenIds.map((allergen_id) => ({ allergen_id })))
            .select('allergen_id'),
        );
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['preferences', 'allergens'] }),
  });
}

// --- Follows ----------------------------------------------------------------

export function useFollowCounts(userId: string | undefined) {
  return useQuery({
    queryKey: ['follows', 'counts', userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const followers = await socialDb
        .from('follows')
        .select('follower_id', { count: 'exact', head: true })
        .eq('followee_id', userId!);
      const following = await socialDb
        .from('follows')
        .select('followee_id', { count: 'exact', head: true })
        .eq('follower_id', userId!);
      if (followers.error) throw new Error(followers.error.message);
      if (following.error) throw new Error(following.error.message);
      return { followers: followers.count ?? 0, following: following.count ?? 0 };
    },
  });
}

export function useIsFollowing(userId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['follows', 'mine', userId, user?.id ?? null],
    enabled: Boolean(user && userId && user.id !== userId),
    queryFn: async (): Promise<boolean> => {
      const row = unwrapMaybe(
        await socialDb
          .from('follows')
          .select('followee_id')
          .eq('follower_id', user!.id)
          .eq('followee_id', userId!)
          .maybeSingle(),
      );
      return Boolean(row);
    },
  });
}

export function useToggleFollow(userId: string) {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (following: boolean) => {
      if (following) {
        unwrap(
          await socialDb
            .from('follows')
            .delete()
            .eq('follower_id', user!.id)
            .eq('followee_id', userId)
            .select('followee_id'),
        );
      } else {
        unwrap(
          await socialDb
            .from('follows')
            .insert({ followee_id: userId })
            .select('followee_id')
            .single(),
        );
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['follows'] }),
  });
}
