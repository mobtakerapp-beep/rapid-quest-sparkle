import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { subscribeNotifications } from "@/lib/notifications";
import { toast } from "sonner";
import { playNotificationSound } from "@/lib/sounds";

type Notif = { id: string; title: string; body: string | null; link: string | null; is_read: boolean; created_at: string; type: string };

const sameNotification = (a: Notif, b: Notif) =>
  a.id === b.id || (a.type === b.type && a.title === b.title && a.body === b.body && a.link === b.link);

export function NotificationBell({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notif[]>([]);
  const unread = items.filter((n) => !n.is_read).length;

  const load = async () => {
    const { data } = await supabase.from("notifications").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(30);
    setItems((prev) => {
      const dbItems = (data || []) as Notif[];
      const localItems = prev.filter((n) => n.id.startsWith("local-") && !dbItems.some((d) => sameNotification(d, n)));
      return [...localItems, ...dbItems];
    });
  };

  const pushNotification = (n: Notif) => {
    setItems((p) => p.some((old) => sameNotification(old, n)) ? p : [n, ...p]);
    toast(n.title, { description: n.body || undefined });
    try { if (!(n as any).soundPlayed && localStorage.getItem("sound-notifs") !== "off") playNotificationSound(); } catch {}
  };

  useEffect(() => {
    load();
    const unsub = subscribeNotifications(userId, (n) => {
      pushNotification(n as Notif);
    });
    const onLocalNotification = (event: Event) => pushNotification((event as CustomEvent<Notif>).detail);
    window.addEventListener("lovable-local-notification", onLocalNotification as EventListener);
    // Polling fallback: refresh every 15s in case realtime drops
    const interval = setInterval(load, 15000);
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      unsub.then((fn) => fn());
      clearInterval(interval);
      window.removeEventListener("lovable-local-notification", onLocalNotification as EventListener);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const markAll = async () => {
    await supabase.from("notifications").update({ is_read: true }).eq("user_id", userId).eq("is_read", false);
    setItems((p) => p.map((n) => ({ ...n, is_read: true })));
  };

  return (
    <div className="relative">
      <button onClick={() => { setOpen((v) => !v); if (!open) markAll(); }}
        className="relative p-2 rounded-xl hover:bg-secondary" aria-label="الإشعارات">
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] flex items-center justify-center font-bold">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute left-0 mt-2 w-80 max-h-96 overflow-y-auto bg-card border border-border rounded-2xl shadow-xl z-[110]">
          <div className="p-3 border-b border-border font-bold text-sm">الإشعارات</div>
          {items.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">لا توجد إشعارات</div>
          ) : items.map((n) => (
            <Link key={n.id} to={(n.link || "/") as any} onClick={() => setOpen(false)}
              className="block p-3 border-b border-border last:border-0 hover:bg-secondary/50 text-right">
              <div className="font-semibold text-sm">{n.title}</div>
              {n.body && <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.body}</div>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}