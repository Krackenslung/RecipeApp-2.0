import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthProvider';

const BUCKET = 'recipe-images';
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

export class UploadError extends Error {}

/**
 * Browser -> Supabase Storage directly, with the user's own JWT. No server hop.
 *
 * The path is `{user_id}/{recipe_id}/{filename}` because the storage policy
 * reads the first segment — get it wrong and the insert is rejected. The
 * filename is a fresh UUID, never the original name: the bucket is public, so
 * predictable paths are enumerable.
 */
export function useUploadRecipeImage() {
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ recipeId, file }: { recipeId: string; file: File }) => {
      if (!user) throw new UploadError('Inicia sesión para subir fotos.');
      if (!ALLOWED.includes(file.type)) {
        throw new UploadError('Solo aceptamos JPG, PNG, WebP o AVIF.');
      }
      if (file.size > MAX_BYTES) {
        throw new UploadError('La foto pesa más de 5 MB.');
      }

      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
      const path = `${user.id}/${recipeId}/${crypto.randomUUID()}.${ext}`;

      const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type,
        cacheControl: '31536000',
        upsert: false,
      });
      if (error) {
        console.error('[storage] upload', error);
        throw new UploadError('No pudimos subir la foto. Inténtalo de nuevo.');
      }

      // Public bucket: a permanent CDN URL that drops straight into <img src>.
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      return { path, publicUrl: data.publicUrl };
    },
  });
}
