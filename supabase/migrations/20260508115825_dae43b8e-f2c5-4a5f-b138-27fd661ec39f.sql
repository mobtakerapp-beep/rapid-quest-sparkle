
INSERT INTO public.badges (id, name, description, icon, color) VALUES
  ('excellence', 'شارة التميز', 'تمنح للطالب المتميز في أداءه', '🌟', 'amber'),
  ('distinction', 'شارة التفوق', 'تمنح للطالب المتفوق دراسياً', '🏆', 'violet'),
  ('participation', 'شارة المشاركة', 'تمنح للطالب الفاعل في المشاركة', '🙋', 'cyan'),
  ('creativity', 'شارة الإبداع', 'تمنح للطالب المبدع', '🎨', 'rose'),
  ('perseverance', 'شارة المثابرة', 'تمنح للطالب المثابر والمجتهد', '💪', 'emerald'),
  ('leadership', 'شارة القيادة', 'تمنح للطالب القائد', '👑', 'amber'),
  ('honor_student', 'شارة طالب الأسبوع', 'الطالب المتصدر هذا الأسبوع', '🎖️', 'violet'),
  ('helpful', 'شارة المساعد', 'تمنح للطالب المساعد لزملائه', '🤝', 'cyan')
ON CONFLICT (id) DO NOTHING;

-- Tighten user_badges insert: teachers/admins can grant any badge to any user;
-- regular users can only insert badges for themselves (auto-awards via triggers run as definer).
DROP POLICY IF EXISTS ub_insert_service ON public.user_badges;
CREATE POLICY ub_insert_self_or_teacher ON public.user_badges
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    OR public.is_teacher(auth.uid())
  );

-- Notify the recipient when a badge is granted
CREATE OR REPLACE FUNCTION public.notify_new_badge()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE bname TEXT;
BEGIN
  SELECT name INTO bname FROM public.badges WHERE id = NEW.badge_id;
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (NEW.user_id, 'badge', 'حصلت على شارة جديدة 🏅', COALESCE(bname, NEW.badge_id), '/badges');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_new_badge ON public.user_badges;
CREATE TRIGGER trg_new_badge AFTER INSERT ON public.user_badges
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_badge();
