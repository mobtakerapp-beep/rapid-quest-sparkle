import { supabase } from "@/integrations/supabase/client";

export async function subscribeNotifications(userId: string, onNew: (n: any) => void) {
  const channel = supabase
    .channel(`notifs-${userId}-${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
      (payload) => onNew(payload.new))
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}
