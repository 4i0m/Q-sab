-- ============================================================================
-- Q Social Network — Supabase Storage Bucket & Access Policies
-- ============================================================================
-- Architecture:
-- - Authentication & Database remain on Firebase Auth + Cloud Firestore.
-- - Media files (avatars, banners, posts, stories, groups, chats, audio)
--   are stored exclusively in Supabase Storage bucket `q-media`.
-- - All uploads and deletions are authorized server-side in `server.ts`
--   AFTER cryptographic verification of the caller's Firebase ID token and
--   strict `${folder}/${uid}/${fileName}` path ownership checks.
-- - Client SDKs never receive `SUPABASE_SERVICE_ROLE_KEY` and cannot write
--   or delete directly in `storage.objects`.
-- ============================================================================

-- 1. Create public read bucket (with MIME and 30MB size enforcement)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'q-media',
  'q-media',
  true,
  31457280, -- 30 MB max file size
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'video/x-m4v',
    'audio/webm',
    'audio/ogg',
    'audio/mp4',
    'audio/mpeg',
    'audio/wav',
    'audio/aac',
    'audio/x-m4a'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Enable RLS on storage.objects (enabled by default in Supabase)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 3. Drop legacy policies if re-running
DROP POLICY IF EXISTS "Q media public read" ON storage.objects;
DROP POLICY IF EXISTS "Q media deny direct client insert" ON storage.objects;
DROP POLICY IF EXISTS "Q media deny direct client update" ON storage.objects;
DROP POLICY IF EXISTS "Q media deny direct client delete" ON storage.objects;

-- 4. Allow CDN / browser playback & image rendering for stored media URLs
CREATE POLICY "Q media public read"
ON storage.objects
FOR SELECT
USING (bucket_id = 'q-media');

-- 5. Lock down direct anon/authenticated browser writes & deletes;
--    server.ts uses service_role ONLY after verifying Firebase ID tokens.
CREATE POLICY "Q media deny direct client insert"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (false);

CREATE POLICY "Q media deny direct client update"
ON storage.objects
FOR UPDATE
TO anon, authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY "Q media deny direct client delete"
ON storage.objects
FOR DELETE
TO anon, authenticated
USING (false);
