import { supabase } from "@/integrations/supabase/client";

/**
 * Returns true ONLY for users who claimed an authorized role with a code:
 * (admin / teacher / supervisor in user_roles).
 * Self-set profiles.role_type is NOT enough.
 */
export async function isVerifiedTeacher(uid: string): Promise<boolean> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", uid);
  return !!data?.some((r) => ["admin", "teacher", "supervisor"].includes(String(r.role)));
}
