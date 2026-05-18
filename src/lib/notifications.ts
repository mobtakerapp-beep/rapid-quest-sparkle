import { supabase } from "@/integrations/supabase/client";

export async function subscribeNotifications(
  userId: string,
  onNew: (n: any) => void,
  roleType?: string | null
) {
  const isPrivileged = roleType === "admin" || roleType === "supervisor" || roleType === "teacher";

  const listenConfig: any = {
    event: "INSERT",
    schema: "public",
    table: "notifications",
  };
  if (!isPrivileged) {
    listenConfig.filter = `user_id=eq.${userId}`;
  }

  const channel = supabase
    .channel(`notifs-${userId}-${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", listenConfig, (payload) => onNew(payload.new))
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}
