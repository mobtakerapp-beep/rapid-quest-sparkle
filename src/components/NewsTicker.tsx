import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Megaphone, Plus, X, Star } from "lucide-react";
import { toast } from "sonner";

type TickerItem = { id: string; text: string; type: "auto" | "custom" };

const TICKER_CHANNEL = "ticker_broadcast_v1";
const STORAGE_KEY = "ticker_custom_items_v1";

function loadCustomItems(): TickerItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveCustomItems(items: TickerItem[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch {}
}

async function fetchAutoItems(): Promise<TickerItem[]> {
  const items: TickerItem[] = [];
  try {
    const { data: comps } = await supabase
      .from("competitions")
      .select("id, title, ends_at")
      .lt("ends_at", new Date().toISOString())
      .order("ends_at", { ascending: false })
      .limit(5);

    for (const comp of (comps || [])) {
      const { data: subs } = await supabase
        .from("competition_submissions")
        .select("user_id, is_correct, correct_count, question_count, time_taken_seconds")
        .eq("competition_id", comp.id)
        .order("correct_count", { ascending: false })
        .limit(5);
      if (!subs?.length) continue;
      const sorted = [...subs].sort((a: any, b: any) => {
        const ac = a.correct_count ?? (a.is_correct ? 1 : 0);
        const bc = b.correct_count ?? (b.is_correct ? 1 : 0);
        return bc - ac || a.time_taken_seconds - b.time_taken_seconds;
      });
      const top: any = sorted[0];
      if (!top || (top.correct_count === 0 && !top.is_correct)) continue;
      const { data: prof } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", top.user_id)
        .maybeSingle();
      const name = (prof as any)?.display_name || "—";
      const score = top.question_count
        ? `${top.correct_count}/${top.question_count}`
        : (top.is_correct ? "إجابة صحيحة" : "");
      const time = top.time_taken_seconds >= 60
        ? `${Math.floor(top.time_taken_seconds / 60)}د ${top.time_taken_seconds % 60}ث`
        : `${top.time_taken_seconds}ث`;
      items.push({
        id: `comp-${comp.id}`,
        text: `🏆 الفائز في "${comp.title}": ${name}${score ? ` — النتيجة: ${score}` : ""} — الوقت: ${time}`,
        type: "auto",
      });
    }

    const { data: topProfiles } = await supabase
      .from("profiles")
      .select("display_name, points")
      .order("points", { ascending: false })
      .limit(3);

    (topProfiles || []).forEach((p: any, i: number) => {
      if (!p.display_name || !p.points) return;
      const medals = ["🥇", "🥈", "🥉"];
      items.push({
        id: `profile-${i}`,
        text: `${medals[i]} أعلى نقاط: ${p.display_name} — ${p.points} نقطة`,
        type: "auto",
      });
    });
  } catch (e) {
    console.error("ticker fetch error", e);
  }
  return items;
}

export function NewsTicker({ userId, canManage }: { userId: string | null; canManage: boolean }) {
  const [items, setItems] = useState<TickerItem[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newText, setNewText] = useState("");
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const tickerRef = useRef<HTMLDivElement>(null);

  const refresh = async () => {
    const auto = await fetchAutoItems();
    const custom = loadCustomItems();
    setItems([...custom, ...auto]);
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30 * 60 * 1000);

    channelRef.current = supabase
      .channel(TICKER_CHANNEL)
      .on("broadcast", { event: "new_item" }, ({ payload }: any) => {
        const incoming = payload as TickerItem;
        setItems((prev) => {
          if (prev.some((x) => x.id === incoming.id)) return prev;
          const updated = [incoming, ...prev];
          if (incoming.type === "custom") {
            const existing = loadCustomItems();
            if (!existing.some((x) => x.id === incoming.id)) {
              saveCustomItems([incoming, ...existing]);
            }
          }
          return updated;
        });
      })
      .on("broadcast", { event: "remove_item" }, ({ payload }: any) => {
        const updated = loadCustomItems().filter((x) => x.id !== payload.id);
        saveCustomItems(updated);
        setItems((prev) => prev.filter((x) => x.id !== payload.id));
      })
      .subscribe();

    return () => {
      clearInterval(interval);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, []);

  const addItem = () => {
    const text = newText.trim();
    if (!text) return;
    const item: TickerItem = {
      id: `custom-${Date.now()}`,
      text,
      type: "custom",
    };
    const updated = [item, ...loadCustomItems()];
    saveCustomItems(updated);
    setItems((prev) => [item, ...prev]);
    channelRef.current?.send({ type: "broadcast", event: "new_item", payload: item });
    toast.success("تمت إضافة الإعلان للشريط ✅");
    setNewText("");
    setShowAdd(false);
  };

  const removeItem = (id: string) => {
    const updated = loadCustomItems().filter((x) => x.id !== id);
    saveCustomItems(updated);
    setItems((prev) => prev.filter((x) => x.id !== id));
    channelRef.current?.send({ type: "broadcast", event: "remove_item", payload: { id } });
    toast.success("تم حذف الإعلان");
  };

  const customItems = loadCustomItems();
  const allItems = items.length > 0 ? items : (canManage ? [] : null);

  if (!canManage && items.length === 0) return null;
  if (items.length === 0 && !canManage) return null;

  const displayText = items.length > 0
    ? items.map((it) => it.text).join("   ✦   ")
    : "لا توجد أخبار حالياً — يمكنك إضافة إعلان من زر الإضافة";

  return (
    <div dir="rtl" className="relative bg-gradient-to-r from-amber-600 via-orange-500 to-yellow-500 text-white text-sm font-bold shadow-md overflow-hidden z-[150]">
      <div className="flex items-center">
        <div className="flex items-center gap-1.5 px-3 py-2 bg-black/20 shrink-0 border-l border-white/20 z-10">
          <Megaphone className="h-4 w-4" />
          <span className="text-xs font-black">أخبار</span>
        </div>

        <div className="flex-1 overflow-hidden py-2 px-2">
          {items.length > 0 ? (
            <div
              ref={tickerRef}
              className="whitespace-nowrap inline-block"
              style={{
                animation: `ticker-scroll ${Math.max(20, items.length * 12)}s linear infinite`,
              }}
            >
              {displayText}
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
              {displayText}
            </div>
          ) : (
            <span className="text-white/70 text-xs">أضف أول إعلان من زر الإضافة ←</span>
          )}
        </div>

        {canManage && (
          <button
            onClick={() => setShowAdd((v) => !v)}
            className="flex items-center gap-1 px-3 py-2 bg-black/20 hover:bg-black/30 transition shrink-0 border-r border-white/20 text-xs font-bold"
          >
            <Plus className="h-3.5 w-3.5" />
            إضافة
          </button>
        )}
      </div>

      {showAdd && canManage && (
        <div
          dir="rtl"
          className="absolute top-full right-0 z-[200] bg-card border border-border rounded-2xl shadow-xl p-4 w-80 mt-1"
          style={{ color: "var(--foreground)" }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="font-bold text-sm flex items-center gap-1">
              <Star className="h-4 w-4 text-amber-500" /> إضافة إعلان للشريط
            </span>
            <button onClick={() => setShowAdd(false)} className="p-1 hover:bg-secondary rounded-lg">
              <X className="h-4 w-4" />
            </button>
          </div>
          <textarea
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="اكتب نص الإعلان..."
            rows={2}
            className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm resize-none mb-3"
          />
          <button
            onClick={addItem}
            disabled={!newText.trim()}
            className="w-full py-2 rounded-xl bg-[image:var(--gradient-hero)] text-white font-bold text-sm disabled:opacity-50"
          >
            نشر الإعلان
          </button>

          {customItems.length > 0 && (
            <div className="mt-3 space-y-1">
              <div className="text-xs text-muted-foreground font-bold mb-1">الإعلانات المخصصة ({customItems.length}):</div>
              {customItems.map((it) => (
                <div key={it.id} className="flex items-center gap-2 text-xs bg-secondary/60 rounded-xl px-3 py-2">
                  <span className="flex-1 truncate">{it.text}</span>
                  <button onClick={() => removeItem(it.id)} className="text-destructive shrink-0 hover:opacity-70">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes ticker-scroll {
          0% { transform: translateX(100vw); }
          100% { transform: translateX(-100%); }
        }
      `}</style>
    </div>
  );
}

export function TickerWithRole() {
  const [userId, setUserId] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return;
      const id = data.session.user.id;
      setUserId(id);
      const [{ data: roles }, { data: profile }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", id),
        supabase.from("profiles").select("role_type").eq("id", id).maybeSingle(),
      ]);
      const manageRoles = ["admin", "supervisor", "teacher"];
      const hasRoleInTable = !!roles?.some((r: any) => manageRoles.includes(String(r.role)));
      const hasRoleInProfile = manageRoles.includes(String((profile as any)?.role_type || ""));
      setCanManage(hasRoleInTable || hasRoleInProfile);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (_, s) => {
      if (!s?.user) { setUserId(null); setCanManage(false); return; }
      const id = s.user.id;
      setUserId(id);
      const [{ data: roles }, { data: profile }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", id),
        supabase.from("profiles").select("role_type").eq("id", id).maybeSingle(),
      ]);
      const manageRoles = ["admin", "supervisor", "teacher"];
      const hasRoleInTable = !!roles?.some((r: any) => manageRoles.includes(String(r.role)));
      const hasRoleInProfile = manageRoles.includes(String((profile as any)?.role_type || ""));
      setCanManage(hasRoleInTable || hasRoleInProfile);
    });
    return () => { sub.subscription.unsubscribe(); };
  }, []);

  return <NewsTicker userId={userId} canManage={canManage} />;
}
