import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, CheckCheck, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { subscribeNotifications } from "@/lib/notifications";
import { toast } from "sonner";
import { playNotificationSound } from "@/lib/sounds";

type Notif = {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
  type: string;
};

type ProfileInfo = { display_name: string | null; avatar_url: string | null };

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
  } catch { return ""; }
}

export function NotificationBell({ userId, roleType }: { userId: string; roleType?: string | null }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notif[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileInfo>>({});

  const isPrivileged = roleType === "admin" || roleType === "supervisor" || roleType === "teacher";

  const unread = items.filter((n) => !n.is_read && n.user_id === userId).length;

  const loadProfiles = async (notifs: Notif[]) => {
    const foreignIds = [...new Set(notifs.map((n) => n.user_id).filter((id) => id !== userId))];
    if (foreignIds.length === 0) return;
    const { data } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .in("id", foreignIds);
    if (data) {
      setProfiles((prev) => ({
        ...prev,
        ...Object.fromEntries(data.map((p) => [p.id, { display_name: p.display_name, avatar_url: p.avatar_url }])),
      }));
    }
  };

  const load = async () => {
    let query = supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(isPrivileged ? 60 : 30);

    if (!isPrivileged) {
      query = query.eq("user_id", userId);
    }

    const { data } = await query;
    const dbItems = (data || []) as Notif[];
    setItems((prev) => {
      const localItems = prev.filter(
        (n) => n.id.startsWith("local-") && !dbItems.some((d) => sameNotification(d, n))
      );
      return [...localItems, ...dbItems];
    });
    if (isPrivileged) loadProfiles(dbItems);
  };

  const pushNotification = (n: Notif) => {
    setItems((p) => (p.some((old) => sameNotification(old, n)) ? p : [n, ...p]));
    if (n.user_id === userId) {
      toast(n.title, { description: n.body || undefined });
      try {
        if (!(n as any).soundPlayed && localStorage.getItem("sound-notifs") !== "off") playNotificationSound();
      } catch {}
    } else if (isPrivileged) {
      const name = profiles[n.user_id]?.display_name;
      toast(n.title, { description: name ? `📌 ${name}: ${n.body || ""}` : n.body || undefined });
    }
  };

  useEffect(() => {
    load();
    const unsub = subscribeNotifications(userId, (n) => pushNotification(n as Notif), roleType);
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
  }, [userId, roleType]);

  const markAllOwnRead = async () => {
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", userId)
      .eq("is_read", false);
    setItems((p) => p.map((n) => (n.user_id === userId ? { ...n, is_read: true } : n)));
  };

  const typeIcon: Record<string, string> = {
    warning: "⚠️", ban: "🚫", badge: "🏅", certificate: "📜",
    assignment: "📋", competition: "🏆", message: "💬",
    activity: "📚", quiz: "🎯",
  };

  const ownNotifs = items.filter((n) => n.user_id === userId);
  const otherNotifs = items.filter((n) => n.user_id !== userId);

  return (
    <div className="relative">
      <button
        onClick={() => { setOpen((v) => !v); if (!open) markAllOwnRead(); }}
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
        <div
          className="absolute left-0 mt-2 w-80 max-h-[75vh] overflow-y-auto bg-card border border-border rounded-2xl shadow-xl z-[300]"
          dir="rtl"
        >
          {/* رأس القائمة */}
          <div className="sticky top-0 bg-card px-3 py-2.5 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="font-black text-sm">الإشعارات</span>
              {isPrivileged && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--brand)]/10 text-[var(--brand)] font-bold">
                  {roleType === "teacher" ? "معلم" : "مشرف"}
                </span>
              )}
            </div>
            {unread > 0 && (
              <button
                onClick={markAllOwnRead}
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition"
              >
                <CheckCheck className="h-3 w-3" /> تحديد كمقروء
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              <Bell className="h-8 w-8 mx-auto mb-2 opacity-30" />
              لا توجد إشعارات
            </div>
          ) : (
            <>
              {/* إشعاراتي */}
              {ownNotifs.length > 0 && (
                <>
                  {isPrivileged && (
                    <div className="px-3 py-1.5 bg-secondary/40 border-b border-border text-[10px] font-bold text-muted-foreground flex items-center gap-1">
                      👤 إشعاراتي
                    </div>
                  )}
                  {ownNotifs.map((n) => (
                    <NotifRow key={n.id} n={n} typeIcon={typeIcon} onClose={() => setOpen(false)} />
                  ))}
                </>
              )}

              {/* إشعارات الطلاب / المستخدمين الآخرين */}
              {isPrivileged && otherNotifs.length > 0 && (
                <>
                  <div className="px-3 py-1.5 bg-amber-50 dark:bg-amber-950/30 border-y border-amber-200/50 dark:border-amber-800/30 text-[10px] font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1 sticky top-[37px] z-10">
                    <Users className="h-3 w-3" />
                    {roleType === "teacher" ? "إشعارات الطلاب" : "إشعارات المستخدمين"}
                    <span className="mr-auto bg-amber-100 dark:bg-amber-900/40 px-1.5 rounded-full">
                      {otherNotifs.length}
                    </span>
                  </div>
                  {otherNotifs.map((n) => (
                    <NotifRow
                      key={n.id}
                      n={n}
                      typeIcon={typeIcon}
                      onClose={() => setOpen(false)}
                      ownerName={profiles[n.user_id]?.display_name || null}
                    />
                  ))}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function NotifRow({
  n, typeIcon, onClose, ownerName,
}: {
  n: Notif;
  typeIcon: Record<string, string>;
  onClose: () => void;
  ownerName?: string | null;
}) {
  return (
    <Link
      to={(n.link || "/") as any}
      onClick={onClose}
      className={`flex gap-2.5 p-3 border-b border-border/60 last:border-0 hover:bg-secondary/50 transition text-right ${!n.is_read && !ownerName ? "bg-[var(--brand)]/5" : ""}`}
    >
      <div className="mt-1 shrink-0">
        <span className={`block h-2 w-2 rounded-full ${!n.is_read && !ownerName ? "bg-[var(--brand)]" : "bg-transparent"}`} />
      </div>
      <div className="flex-1 min-w-0">
        {ownerName && (
          <div className="flex items-center gap-1 mb-1">
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 font-bold truncate max-w-[140px]">
              👤 {ownerName}
            </span>
          </div>
        )}
        <div className="flex items-start gap-1 flex-wrap">
          {typeIcon[n.type] && (
            <span className="text-xs shrink-0">{typeIcon[n.type]}</span>
          )}
          <span className={`text-xs font-bold leading-snug ${!n.is_read && !ownerName ? "text-foreground" : "text-muted-foreground"}`}>
            {n.title}
          </span>
        </div>
        {n.body && (
          <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5 leading-relaxed">{n.body}</p>
        )}
        <p className="text-[10px] text-muted-foreground/70 mt-1 font-medium" dir="rtl">
          🕐 {formatTime(n.created_at)}
        </p>
      </div>
    </Link>
  );
}
