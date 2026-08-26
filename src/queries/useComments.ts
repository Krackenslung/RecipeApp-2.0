import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { appDb, socialDb, unwrap } from '@/lib/supabase';
import type { Database } from '@/types/database';

type CommentRow = Database['social']['Tables']['comments']['Row'];

export type CommentNode = CommentRow & {
  author: { username: string; display_name: string | null; avatar_url: string | null } | null;
  replies: CommentNode[];
};

/**
 * One level of threading, so the tree is built client-side from a flat fetch.
 * Soft-deleted rows are kept — the thread would otherwise lose its shape — and
 * rendered as a tombstone.
 */
export function useComments(recipeId: string | undefined) {
  return useQuery({
    queryKey: ['comments', 'byRecipe', recipeId],
    enabled: Boolean(recipeId),
    queryFn: async (): Promise<CommentNode[]> => {
      const rows = unwrap(
        await socialDb
          .from('comments')
          .select('*')
          .eq('recipe_id', recipeId!)
          .order('created_at', { ascending: true })
          .range(0, 199),
      );
      if (!rows.length) return [];

      const authorIds = [...new Set(rows.map((r) => r.user_id))];
      const profiles = unwrap(
        await appDb
          .from('profiles')
          .select('id, username, display_name, avatar_url')
          .in('id', authorIds),
      );
      const byId = new Map(profiles.map((p) => [p.id, p]));

      const nodes = new Map<number, CommentNode>();
      for (const row of rows) {
        nodes.set(row.comment_id, {
          ...row,
          author: byId.get(row.user_id) ?? null,
          replies: [],
        });
      }

      const roots: CommentNode[] = [];
      for (const node of nodes.values()) {
        const parent = node.parent_id != null ? nodes.get(node.parent_id) : undefined;
        if (parent) parent.replies.push(node);
        else roots.push(node);
      }
      return roots;
    },
  });
}

export function usePostComment(recipeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ body, parentId }: { body: string; parentId?: number | null }) =>
      unwrap(
        await socialDb
          .from('comments')
          // user_id has `default auth.uid()` — never write it from the client.
          .insert({ recipe_id: recipeId, body, parent_id: parentId ?? null })
          .select('*')
          .single(),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comments', 'byRecipe', recipeId] }),
  });
}

export function useDeleteComment(recipeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (commentId: number) =>
      unwrap(
        await socialDb
          .from('comments')
          .update({ deleted_at: new Date().toISOString() })
          .eq('comment_id', commentId)
          .select('comment_id')
          .single(),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comments', 'byRecipe', recipeId] }),
  });
}
