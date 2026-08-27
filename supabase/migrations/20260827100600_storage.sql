-- Storage — the recipe-images bucket.
--
-- Public, because recipe photos are meant to be seen and a public bucket gives
-- permanent CDN URLs that drop straight into <img src>. Private buckets need
-- signed URLs that expire and have to be re-signed on every page load: real
-- friction for something that is not secret.
--
-- The trade is that anyone holding a URL can view it, and guessable paths are
-- enumerable — which is why useUpload.ts names files with crypto.randomUUID()
-- rather than reusing the upload's own filename.
--
-- If something genuinely non-public shows up later, add a second private
-- bucket. Do not make this one private to solve it.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recipe-images',
  'recipe-images',
  true,
  5242880,   -- 5 MiB
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do nothing;


-- storage.objects is an ordinary table, so it takes ordinary policies.
--
-- The path convention {user_id}/{recipe_id}/{filename} is load-bearing: the
-- policy reads the first segment and compares it to the caller. Change the
-- convention and these policies stop meaning anything.

create policy "recipe images are public"
  on storage.objects for select
  using (bucket_id = 'recipe-images');

create policy "users upload to own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'recipe-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "users replace own files"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'recipe-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "users delete own files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'recipe-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
