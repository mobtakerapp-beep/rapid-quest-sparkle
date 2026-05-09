REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_banned(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_teacher(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_admin_role(TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_teacher_role(TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_message_profanity() FROM anon;
REVOKE EXECUTE ON FUNCTION public.auto_approve_activity() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_new_activity() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_activity_approved() FROM anon;
REVOKE EXECUTE ON FUNCTION public.award_activity_badges() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_new_dm() FROM anon;
REVOKE EXECUTE ON FUNCTION public.award_point() FROM anon;
REVOKE EXECUTE ON FUNCTION public.award_competition_points() FROM anon;
REVOKE EXECUTE ON FUNCTION public.award_competition_badge() FROM anon;
REVOKE EXECUTE ON FUNCTION public.award_quiz_points() FROM anon;

GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_banned(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_teacher(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_admin_role(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_teacher_role(TEXT) TO authenticated;

DROP POLICY IF EXISTS "chat_images_public_read" ON storage.objects;
DROP POLICY IF EXISTS "activity_files_public_read" ON storage.objects;
DROP POLICY IF EXISTS "gallery_media_public_read" ON storage.objects;
DROP POLICY IF EXISTS "avatars_read" ON storage.objects;
DROP POLICY IF EXISTS "assignment_files_public_read" ON storage.objects;

CREATE POLICY "chat_images_authenticated_read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'chat-images');
CREATE POLICY "activity_files_authenticated_read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'activity-files');
CREATE POLICY "gallery_media_authenticated_read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'gallery-media');
CREATE POLICY "avatars_authenticated_read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'avatars');
CREATE POLICY "assignment_files_authenticated_read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'assignment-files');