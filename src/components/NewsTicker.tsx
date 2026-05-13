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

function getRoleLabel(roleType?: string): string {
  switch (roleType) {
    case "teacher":    return "المعلم";
    case "student":    return "الطالب";
    case "admin":      return "المشرف العام";
    case "supervisor": return "المشرف";
    case "parent":     return "ولي الأمر";
    default:           return "";
  }
}

async function getTopSubmission(compId: string): Promise<{ name: string; roleLabel: string; score: string; time: string; isCorrect: boolean } | null> {
  const { data: subs } = await supabase
    .from("competition_submissions")
    .select("user_id, is_correct, correct_count, question_count, time_taken_seconds")
    .eq("competition_id", compId);
  if (!subs?.length) return null;
  const sorted = [...subs].sort((a: any, b: any) => {
    const ac = a.correct_count ?? (a.is_correct ? 1 : 0);
    const bc = b.correct_count ?? (b.is_correct ? 1 : 0);
    return bc - ac || a.time_taken_seconds - b.time_taken_seconds;
  });
  const top: any = sorted[0];
  if (!top) return null;
  const hasCorrect = top.question_count ? (top.correct_count ?? 0) > 0 : !!top.is_correct;
  const { data: prof } = await supabase.from("profiles").select("display_name, role_type").eq("id", top.user_id).maybeSingle();
  const name = (prof as any)?.display_name || "—";
  const roleLabel = getRoleLabel((prof as any)?.role_type);
  const score = top.question_count ? `${top.correct_count ?? 0}/${top.question_count}` : (top.is_correct ? "إجابة صحيحة" : "");
  const time = top.time_taken_seconds >= 60
    ? `${Math.floor(top.time_taken_seconds / 60)}د ${top.time_taken_seconds % 60}ث`
    : `${top.time_taken_seconds}ث`;
  return { name, roleLabel, score, time, isCorrect: hasCorrect };
}

async function getGalleryLeader(contestId: string): Promise<{ name: string; roleLabel: string; votes: number } | null> {
  const { data: entries } = await supabase.from("gallery_contest_entries").select("id, user_id").eq("contest_id", contestId);
  if (!entries?.length) return null;
  const { data: votes } = await supabase.from("gallery_contest_votes").select("entry_id").in("entry_id", entries.map((e: any) => e.id));
  if (!votes?.length) return null;
  const voteCount: Record<string, number> = {};
  (votes || []).forEach((v: any) => { voteCount[v.entry_id] = (voteCount[v.entry_id] || 0) + 1; });
  let bestEntry = entries[0]; let bestVotes = voteCount[entries[0].id] || 0;
  for (const e of entries) {
    const v = voteCount[e.id] || 0;
    if (v > bestVotes) { bestEntry = e; bestVotes = v; }
  }
  if (!bestVotes) return null;
  const { data: prof } = await supabase.from("profiles").select("display_name, role_type").eq("id", bestEntry.user_id).maybeSingle();
  return { name: (prof as any)?.display_name || "—", roleLabel: getRoleLabel((prof as any)?.role_type), votes: bestVotes };
}

async function fetchAutoItems(): Promise<TickerItem[]> {
  const items: TickerItem[] = [];
  try {
    const now = new Date().toISOString();

    // ── مسابقات منتهية: الفائز النهائي ──
    const { data: endedComps } = await supabase
      .from("competitions")
      .select("id, title, ends_at")
      .lt("ends_at", now)
      .order("ends_at", { ascending: false })
      .limit(5);

    for (const comp of (endedComps || [])) {
      const top = await getTopSubmission(comp.id);
      if (!top || !top.isCorrect) continue;
      items.push({
        id: `comp-${comp.id}`,
        text: `🏆 الفائز في "${comp.title}": ${top.roleLabel} ${top.name}${top.score ? ` — النتيجة: ${top.score}` : ""} — الوقت: ${top.time}`,
        type: "auto",
      });
    }

    // ── مسابقات نشطة: المتصدر الحالي ──
    const { data: activeComps } = await supabase
      .from("competitions")
      .select("id, title, ends_at")
      .gt("ends_at", now)
      .order("ends_at", { ascending: true })
      .limit(3);

    for (const comp of (activeComps || [])) {
      const top = await getTopSubmission(comp.id);
      if (!top) continue;
      items.push({
        id: `comp-active-${comp.id}`,
        text: `⚡ المتصدر حالياً في "${comp.title}": ${top.roleLabel} ${top.name}${top.score ? ` — ${top.score}` : ""} — المسابقة لا تزال نشطة!`,
        type: "auto",
      });
    }

    // ── معارض منتهية: الفائز النهائي ──
    const { data: endedGallery } = await supabase
      .from("gallery_contests")
      .select("id, title, ends_at")
      .lt("ends_at", now)
      .order("ends_at", { ascending: false })
      .limit(5);

    for (const gc of (endedGallery || [])) {
      const leader = await getGalleryLeader(gc.id);
      if (!leader) continue;
      items.push({
        id: `gallery-${gc.id}`,
        text: `🎨 الفائز في معرض "${gc.title}": ${leader.roleLabel} ${leader.name} — ${leader.votes} ❤`,
        type: "auto",
      });
    }

    // ── معارض نشطة: أكثر عمل حصل على لايكات الآن ──
    const { data: activeGallery } = await supabase
      .from("gallery_contests")
      .select("id, title, ends_at")
      .gt("ends_at", now)
      .order("ends_at", { ascending: true })
      .limit(3);

    for (const gc of (activeGallery || [])) {
      const leader = await getGalleryLeader(gc.id);
      if (!leader) continue;
      items.push({
        id: `gallery-active-${gc.id}`,
        text: `🌟 المتصدر في معرض "${gc.title}": ${leader.roleLabel} ${leader.name} — ${leader.votes} ❤ (المسابقة جارية!)`,
        type: "auto",
      });
    }

    const { data: topProfiles } = await supabase
      .from("profiles")
      .select("display_name, points, role_type")
      .order("points", { ascending: false })
      .limit(3);

    const medals = ["🥇", "🥈", "🥉"];
    let medalIdx = 0;
    (topProfiles || []).forEach((p: any) => {
      if (!p.display_name) return;
      const pts = p.points ?? 0;
      if (pts <= 0) return; // only show if they have actual points
      const roleLabel = getRoleLabel(p.role_type);
      const nameWithRole = roleLabel ? `${roleLabel} ${p.display_name}` : p.display_name;
      items.push({
        id: `profile-${medalIdx}`,
        text: `${medals[medalIdx]} المتصدر: ${nameWithRole} — ${pts} نقطة`,
        type: "auto",
      });
      medalIdx++;
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

  if (!canManage && items.length === 0) return null;

  const displayText = items.length > 0
    ? items.map((it) => it.text).join("   ✦   ")
    : "لا توجد أخبار حالياً — يمكنك إضافة إعلان من زر الإضافة";

  return (
    <>
      {/* ── شريط الأخبار ── */}
      <div
        dir="rtl"
        className="relative bg-gradient-to-r from-amber-600 via-orange-500 to-yellow-500 text-white text-sm font-bold shadow-md z-[150]"
      >
        <div className="flex items-center">
          <div className="flex items-center gap-1.5 px-3 py-2 bg-black/20 shrink-0 border-l border-white/20 z-10">
            <Megaphone className="h-4 w-4" />
            <span className="text-xs font-black">أخبار</span>
          </div>

          {/* النص المتحرك — overflow-hidden هنا فقط على النص */}
          <div className="flex-1 overflow-hidden py-2 px-2">
            {items.length > 0 ? (
              <div
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

        <style>{`
          @keyframes ticker-scroll {
            0%   { transform: translateX(100vw); }
            100% { transform: translateX(-100%); }
          }
        `}</style>
      </div>

      {/* ── نافذة الإضافة — خارج overflow-hidden تماماً ── */}
      {showAdd && canManage && (
        <>
          {/* طبقة شفافة لإغلاق النافذة عند الضغط خارجها */}
          <div
            className="fixed inset-0 z-[210]"
            onClick={() => setShowAdd(false)}
          />
          <div
            dir="rtl"
            className="fixed top-10 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 z-[220] bg-card border border-border rounded-2xl shadow-2xl p-4"
            style={{ color: "var(--foreground)" }}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="font-bold text-sm flex items-center gap-1">
                <Star className="h-4 w-4 text-amber-500" /> إضافة إعلان للشريط
              </span>
              <button
                onClick={() => setShowAdd(false)}
                className="p-1 hover:bg-secondary rounded-lg"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <textarea
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              placeholder="اكتب نص الإعلان هنا..."
              rows={3}
              autoFocus
              className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm resize-none mb-3 focus:outline-none focus:ring-2 focus:ring-amber-400"
            />

            <button
              onClick={addItem}
              disabled={!newText.trim()}
              className="w-full py-2 rounded-xl bg-gradient-to-l from-amber-500 to-orange-500 text-white font-bold text-sm disabled:opacity-40 hover:opacity-90 transition"
            >
              نشر الإعلان ✓
            </button>

            {customItems.length > 0 && (
              <div className="mt-3 space-y-1">
                <div className="text-xs text-muted-foreground font-bold mb-1">
                  الإعلانات الحالية ({customItems.length}):
                </div>
                {customItems.map((it) => (
                  <div
                    key={it.id}
                    className="flex items-center gap-2 text-xs bg-secondary/60 rounded-xl px-3 py-2"
                  >
                    <span className="flex-1 truncate">{it.text}</span>
                    <button
                      onClick={() => removeItem(it.id)}
                      className="text-destructive shrink-0 hover:opacity-70"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}

export function TickerWithRole() {
  const [userId, setUserId] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);

  useEffect(() => {
    const loadPermissions = async (id: string) => {
      setUserId(id);
      const [{ data: roles }, { data: profile }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", id),
        supabase.from("profiles").select("role_type").eq("id", id).maybeSingle(),
      ]);
      const manageRoles = ["admin", "supervisor"];
      const hasRoleInTable = !!roles?.some((r: any) => manageRoles.includes(String(r.role)));
      const hasRoleInProfile = manageRoles.includes(String((profile as any)?.role_type || ""));
      setCanManage(hasRoleInTable || hasRoleInProfile);
    };

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) loadPermissions(data.session.user.id);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_, s) => {
      if (!s?.user) { setUserId(null); setCanManage(false); return; }
      loadPermissions(s.user.id);
    });

    return () => { sub.subscription.unsubscribe(); };
  }, []);

  return <NewsTicker userId={userId} canManage={canManage} />;
}
