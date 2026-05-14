import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, CheckCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { subscribeNotifications } from "@/lib/notifications";
import { toast } from "sonner";
import { playNotificationSound } from "@/lib/sounds";

type Notif = { id: string; title: string; body: string | null; link: string | null; is_read: boolean; created_at: string; type: string };

const sameNotification = (a: Notif, b: Notif) =>
  a.id === b.id || (a.type === b.type && a.title === b.title && a.body === b.body && a.link === b.link);

function formatTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    const timeStr = date.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit", hour12: true });

    if (diffMins < 1) return "الآن";
    if (diffMins < 60) return `منذ ${diffMins} د • ${timeStr}`;
    if (diffHours < 24) return `منذ ${diffHours} س • ${timeStr}`;
    if (diffDays === 1) return `أمس • ${timeStr}`;
    const dateLabel = date.toLocaleDateString("ar-EG", { month: "short", day: "numeric" });
    return `${dateLabel} • ${timeStr}`;
  } catch {
    return "";
  }
}

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

  const typeIcon: Record<string, string> = {
    warning: "⚠️",
    ban: "🚫",
    badge: "🏅",
    certificate: "📜",
    assignment: "📋",
    competition: "🏆",
    message: "💬",
  };

  return (
    <div className="relative">
      <button
        onClick={() => { setOpen((v) => !v); if (!open) markAll(); }}
        className="relative p-1.5 rounded-xl hover:bg-secondary"
        aria-label="الإشعارات"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-0.5 rounded-full bg-rose-500 text-white text-[9px] flex items-center justify-center font-bold">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 mt-2 w-80 max-h-[70vh] overflow-y-auto bg-card border border-border rounded-2xl shadow-xl z-[300]" dir="rtl">
          {/* رأس القائمة */}
          <div className="sticky top-0 bg-card px-3 py-2.5 border-b border-border flex items-center justify-between">
            <span className="font-black text-sm">الإشعارات</span>
            {unread > 0 && (
              <button
                onClick={markAll}
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition"
              >
                <CheckCheck className="h-3 w-3" /> تحديد الكل كمقروء
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              <Bell className="h-8 w-8 mx-auto mb-2 opacity-30" />
              لا توجد إشعارات
            </div>
          ) : (
            items.map((n) => (
              <Link
                key={n.id}
                to={(n.link || "/") as any}
                onClick={() => setOpen(false)}
                className={`flex gap-2.5 p-3 border-b border-border/60 last:border-0 hover:bg-secondary/50 transition text-right ${!n.is_read ? "bg-[var(--brand)]/5" : ""}`}
              >
                {/* النقطة غير مقروءة */}
                <div className="mt-1 shrink-0">
                  {!n.is_read && (
                    <span className="block h-2 w-2 rounded-full bg-[var(--brand)]" />
                  )}
                  {n.is_read && (
                    <span className="block h-2 w-2 rounded-full bg-transparent" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-1 flex-wrap">
                    {typeIcon[n.type] && (
                      <span className="text-xs shrink-0">{typeIcon[n.type]}</span>
                    )}
                    <span className={`text-xs font-bold leading-snug ${!n.is_read ? "text-foreground" : "text-muted-foreground"}`}>
                      {n.title}
                    </span>
                  </div>
                  {n.body && (
                    <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5 leading-relaxed">{n.body}</p>
                  )}
                  {/* الوقت */}
                  <p className="text-[10px] text-muted-foreground/70 mt-1 font-medium" dir="rtl">
                    🕐 {formatTime(n.created_at)}
                  </p>
                </div>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
