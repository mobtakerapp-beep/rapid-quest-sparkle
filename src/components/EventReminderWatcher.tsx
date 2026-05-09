import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { playNotificationSound } from "@/lib/sounds";

type EventRow = { id: string; title: string; description: string | null; starts_at: string };

function pushEventReminder(e: EventRow) {
  try { if (localStorage.getItem("sound-notifs") !== "off") playNotificationSound(); } catch {}
  window.dispatchEvent(new CustomEvent("lovable-local-notification", {
    detail: {
      id: `local-event-${e.id}`,
      title: `🔔 الفعالية الآن: ${e.title}`,
      body: e.description || "بدأ موعد الفعالية الآن",
      link: "/calendar",
      is_read: false,
      created_at: new Date().toISOString(),
      type: "event_reminder",
      soundPlayed: true,
    },
  }));
}

export function EventReminderWatcher() {
  useEffect(() => {
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    let stopped = false;

    const readFired = () => new Set<string>(JSON.parse(localStorage.getItem("ev_fired") || "[]"));
    const writeFired = (fired: Set<string>) => localStorage.setItem("ev_fired", JSON.stringify([...fired]));

    const loadAndSchedule = async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session || stopped) return;
      const now = Date.now();
      const { data } = await supabase
        .from("events")
        .select("id, title, description, starts_at")
        .gte("starts_at", new Date(now - 10 * 60 * 1000).toISOString())
        .lte("starts_at", new Date(now + 24 * 60 * 60 * 1000).toISOString());

      const fired = readFired();
      (data || []).forEach((e: EventRow) => {
        if (fired.has(e.id) || timers.has(e.id)) return;
        const ms = new Date(e.starts_at).getTime() - Date.now();
        if (ms <= 0 && ms > -10 * 60 * 1000) {
          pushEventReminder(e);
          fired.add(e.id);
          writeFired(fired);
          return;
        }
        if (ms > 0) {
          timers.set(e.id, setTimeout(() => {
            const latest = readFired();
            if (!latest.has(e.id)) {
              pushEventReminder(e);
              latest.add(e.id);
              writeFired(latest);
            }
            timers.delete(e.id);
          }, ms));
        }
      });
    };

    loadAndSchedule();
    const interval = setInterval(loadAndSchedule, 60000);
    return () => {
      stopped = true;
      clearInterval(interval);
      timers.forEach(clearTimeout);
    };
  }, []);

  return null;
}