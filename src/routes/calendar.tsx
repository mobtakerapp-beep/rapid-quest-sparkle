import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Calendar as CalIcon, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { DateTimePicker } from "@/components/DateTimePicker";
import { playNotificationSound } from "@/lib/sounds";

export const Route = createFileRoute("/calendar")({ component: CalendarPage });

type Ev = { id: string; title: string; description: string | null; starts_at: string; ends_at: string | null; type: string; created_by: string };

const notifyEventNow = (e: Ev) => {
  const detail = {
    id: `local-event-${e.id}`,
    title: `🔔 الفعالية الآن: ${e.title}`,
    body: e.description || "بدأ موعد الفعالية الآن",
    link: "/calendar",
    is_read: false,
    created_at: new Date().toISOString(),
    type: "event_reminder",
  };
  window.dispatchEvent(new CustomEvent("lovable-local-notification", { detail }));
  try { if (localStorage.getItem("sound-notifs") !== "off") playNotificationSound(); } catch {}
};

function CalendarPage() {
  const navigate = useNavigate();
  const [uid, setUid] = useState<string | null>(null);
  const [isTeacher, setIsTeacher] = useState(false);
  const [events, setEvents] = useState<Ev[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [type, setType] = useState("general");

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { navigate({ to: "/login" }); return; }
      const id = data.session.user.id;
      setUid(id);
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", id);
      setIsTeacher(!!roles?.some((r) => ["admin", "teacher", "supervisor"].includes(String(r.role))));
      load();
    });
  }, [navigate]);

  const load = async () => {
    const { data } = await supabase.from("events").select("*").gte("starts_at", new Date(Date.now() - 30 * 86400000).toISOString()).order("starts_at");
    setEvents((data || []) as Ev[]);
  };

  // Schedule client-side reminders for upcoming events (fires once when due)
  useEffect(() => {
    const fired = new Set<string>(JSON.parse(localStorage.getItem("ev_fired") || "[]"));
    const timers: ReturnType<typeof setTimeout>[] = [];
    events.forEach((e) => {
      if (fired.has(e.id)) return;
      const ms = new Date(e.starts_at).getTime() - Date.now();
      if (ms <= 0 && ms > -10 * 60 * 1000) {
        notifyEventNow(e);
        fired.add(e.id);
        localStorage.setItem("ev_fired", JSON.stringify([...fired]));
        return;
      }
      if (ms > 0 && ms < 24 * 3600 * 1000) {
        timers.push(setTimeout(() => {
          notifyEventNow(e);
          fired.add(e.id);
          localStorage.setItem("ev_fired", JSON.stringify([...fired]));
        }, ms));
      }
    });
    return () => { timers.forEach(clearTimeout); };
  }, [events]);

  const create = async () => {
    if (!uid) return;
    if (!title.trim()) { toast.error("اكتبي عنوان الفعالية"); return; }
    if (!startsAt) { toast.error("اختاري تاريخ ووقت الفعالية"); return; }
    const { error } = await supabase.from("events").insert({
      title: title.trim(), description: desc.trim() || null, starts_at: new Date(startsAt).toISOString(), type, created_by: uid,
    });
    if (error) return toast.error(error.message);
    toast.success("تمت إضافة الفعالية 🎉");
    const delay = new Date(startsAt).getTime() - Date.now();
    if (delay <= 10 * 60 * 1000) {
      toast.info("تم ضبط تنبيه هذه الفعالية، سيظهر في موعدها هنا وفي الجرس 🔔");
    }
    setTitle(""); setDesc(""); setStartsAt(""); setShowForm(false);
    load();
  };

  // Group by date
  const grouped: Record<string, Ev[]> = {};
  events.forEach((e) => {
    const k = new Date(e.starts_at).toLocaleDateString("ar-EG", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    (grouped[k] = grouped[k] || []).push(e);
  });

  const typeColors: Record<string, string> = {
    general: "bg-violet-100 text-violet-700",
    competition: "bg-amber-100 text-amber-700",
    assignment: "bg-blue-100 text-blue-700",
    event: "bg-emerald-100 text-emerald-700",
  };

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> الرئيسية
          </Link>
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center text-white">
              <CalIcon className="h-5 w-5" />
            </div>
            <h1 className="font-bold">التقويم والفعاليات</h1>
          </div>
        </div>
      </header>
      <main className="container mx-auto px-4 py-6 max-w-3xl">
        {isTeacher && (
          <div className="mb-6">
            {!showForm ? (
              <button onClick={() => setShowForm(true)} className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-[image:var(--gradient-hero)] text-white font-bold">
                <Plus className="h-5 w-5" /> إضافة فعالية
              </button>
            ) : (
              <div className="bg-card rounded-3xl border border-border p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold">فعالية جديدة</h3>
                  <button onClick={() => setShowForm(false)}><X className="h-4 w-4" /></button>
                </div>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="العنوان" className="w-full px-4 py-2.5 rounded-xl border border-border bg-background" />
                <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="الوصف" rows={2} className="w-full px-4 py-2.5 rounded-xl border border-border bg-background resize-none" />
                <DateTimePicker value={startsAt} onChange={setStartsAt} />
                <select value={type} onChange={(e) => setType(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-border bg-background">
                  <option value="general">عام</option>
                  <option value="competition">مسابقة</option>
                  <option value="assignment">واجب</option>
                  <option value="event">فعالية</option>
                </select>
                <button onClick={create} className="w-full px-5 py-2.5 rounded-xl bg-[image:var(--gradient-hero)] text-white font-bold">إضافة</button>
              </div>
            )}
          </div>
        )}

        {Object.keys(grouped).length === 0 ? (
          <div className="text-center text-muted-foreground py-16 text-sm">لا توجد فعاليات</div>
        ) : (
          <div className="space-y-5">
            {Object.entries(grouped).map(([day, list]) => (
              <div key={day}>
                <div className="text-sm font-bold text-muted-foreground mb-2">{day}</div>
                <div className="space-y-2">
                  {list.map((e) => (
                    <div key={e.id} className="bg-card rounded-2xl border border-border p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="font-bold mb-1">{e.title}</div>
                          {e.description && <div className="text-sm text-muted-foreground">{e.description}</div>}
                          <div className="text-xs text-muted-foreground mt-2">
                            {new Date(e.starts_at).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}
                          </div>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full ${typeColors[e.type] || typeColors.general}`}>{e.type}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
