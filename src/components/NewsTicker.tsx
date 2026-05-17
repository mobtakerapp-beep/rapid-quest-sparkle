import { useEffect, useRef, useState } from "react";
import { toAr } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Megaphone, Plus, X, Star } from "lucide-react";
import { toast } from "sonner";

type TickerItem = { id: string; text: string; type: "auto" | "custom"; expires_at?: string };

const TICKER_CHANNEL = "ticker_broadcast_v1";
const STORAGE_KEY = "ticker_custom_items_v1";

function loadCustomItems(): TickerItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const all: TickerItem[] = raw ? JSON.parse(raw) : [];
    const now = Date.now();
    // Filter out expired items
    return all.filter((it) => !it.expires_at || new Date(it.expires_at).getTime() > now);
  } catch { return []; }
}

function saveCustomItems(items: TickerItem[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch {}
}

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 3600 * 1000).toISOString();
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
  // Use edge function (service role) so all viewers see the true top scorer, not just their own row
  const { data: fnData } = await supabase.functions.invoke("comp-subs", { body: { competition_id: compId } });
  const subs: any[] = fnData?.data || [];
  if (!subs.length) return null;
  const sorted = [...subs].sort((a: any, b: any) => {
    const ac = a.correct_count ?? (a.is_correct ? 1 : 0);
    const bc = b.correct_count ?? (b.is_correct ? 1 : 0);
    return bc - ac || a.time_taken_seconds - b.time_taken_seconds;
  });
  const top: any = sorted[0];
  if (!top) return null;
  const hasCorrect = top.question_count ? (top.correct_count ?? 0) > 0 : !!top.is_correct;
  const { data: prof } = await supabase.from("profiles").select("display_name, role_type").eq("id", top.user_id).maybeSingle();
  const name = top.name || (prof as any)?.display_name || "—";
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

// ── الأحداث الوطنية والإسلامية العُمانية ──
// Gregorian dates (month 1-based, day). Hijri dates detected via Intl if supported.
const OMAN_EVENTS: { month: number; day: number; text: string }[] = [
  { month: 11, day: 18, text: "🎉 تهانينا بمناسبة العيد الوطني الرابع والخمسين لسلطنة عُمان — كل عام وعُمان بألف خير 🇴🇲" },
  { month: 11, day: 19, text: "🎉 تهانينا بمناسبة العيد الوطني لسلطنة عُمان — يوم المجد والعطاء 🇴🇲" },
  { month: 1,  day: 1,  text: "🌙 كل عام وأنتم بخير بمناسبة العام الجديد — عام مليء بالتعلم والإنجاز ✨" },
  { month: 1,  day: 23, text: "🕌 تهانينا بمناسبة ذكرى المولد النبوي الشريف — اللهم صلِّ على سيدنا محمد ﷺ" },
  { month: 10, day: 1,  text: "🌙 رمضان كريم — كل عام وأنتم بخير، رمضان مبارك على الجميع 🌙" },
  { month: 4,  day: 23, text: "🌍 تهانينا بمناسبة يوم الأرض — نحافظ على بيئتنا لأجيالنا القادمة 🌱" },
];

function getOmanNationalEvents(): TickerItem[] {
  const now = new Date();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  return OMAN_EVENTS
    .filter((e) => e.month === m && e.day === d)
    .map((e, i) => ({ id: `national-${m}-${d}-${i}`, text: e.text, type: "auto" as const }));
}

async function fetchAutoItems(): Promise<TickerItem[]> {
  const items: TickerItem[] = [];
  try {
    const now = new Date().toISOString();
    const twoDaysFromNow = new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString();
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayStartISO = todayStart.toISOString();

    // ── الأحداث الوطنية اليومية ──
    items.push(...getOmanNationalEvents());

    // ── فعاليات قادمة (في غضون 7 أيام) — تبقى حتى يجي وقتها ──
    const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    const { data: upcomingEvents } = await supabase
      .from("events")
      .select("id, title, description, starts_at, type")
      .gte("starts_at", now)
      .lte("starts_at", sevenDaysFromNow)
      .order("starts_at", { ascending: true })
      .limit(5);

    for (const ev of (upcomingEvents || [])) {
      const startsDate = new Date(ev.starts_at);
      const diffMs = startsDate.getTime() - Date.now();
      const diffHours = Math.floor(diffMs / (1000 * 3600));
      const diffMins = Math.floor((diffMs % (1000 * 3600)) / 60000);
      const timeStr = startsDate.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
      let dayStr: string;
      if (diffMins < 2) dayStr = "الآن!";
      else if (diffHours < 1) dayStr = `باقي ${diffMins} دقيقة`;
      else if (diffHours < 24) dayStr = `اليوم الساعة ${timeStr} — باقي ${diffHours} ساعة${diffMins > 0 ? ` و${diffMins} دقيقة` : ""}`;
      else if (diffHours < 48) dayStr = `غداً الساعة ${timeStr}`;
      else dayStr = `بعد ${Math.ceil(diffMs / (1000 * 3600 * 24))} أيام الساعة ${timeStr}`;
      const icon = ev.type === "competition" ? "🏆" : ev.type === "assignment" ? "📋" : "📅";
      items.push({
        id: `event-${ev.id}`,
        text: `${icon} فعالية قادمة: "${ev.title}" — ${dayStr}`,
        type: "auto",
      });
    }

    // ── مسابقات سريعة أُنشئت اليوم ──
    const { data: newComps } = await supabase
      .from("competitions")
      .select("id, title, created_at")
      .gte("created_at", todayStartISO)
      .order("created_at", { ascending: false })
      .limit(3);

    for (const comp of (newComps || [])) {
      items.push({
        id: `comp-new-${comp.id}`,
        text: `⚡ مسابقة سريعة جديدة: "${comp.title}" — شارك الآن وأثبت نفسك! 🏆`,
        type: "auto",
      });
    }

    // ── تنبيه انتهاء المسابقات السريعة (خلال يومين) ──
    const { data: endingSoonComps } = await supabase
      .from("competitions")
      .select("id, title, ends_at")
      .gt("ends_at", now)
      .lte("ends_at", twoDaysFromNow)
      .order("ends_at", { ascending: true })
      .limit(5);

    for (const comp of (endingSoonComps || [])) {
      const endsDate = new Date(comp.ends_at);
      const diffMs = endsDate.getTime() - Date.now();
      const diffHours = Math.floor(diffMs / (1000 * 3600));
      const diffMins = Math.floor((diffMs % (1000 * 3600)) / 60000);
      let remaining = "";
      if (diffHours >= 24) {
        const days = Math.floor(diffHours / 24);
        remaining = `فاضل ${days} يوم`;
      } else if (diffHours > 0) {
        remaining = `فاضل ${diffHours} ساعة و${diffMins} دقيقة`;
      } else {
        remaining = `فاضل ${diffMins} دقيقة فقط`;
      }
      items.push({
        id: `comp-ending-${comp.id}`,
        text: `⏰ تنبيه: مسابقة "${comp.title}" تنتهي قريباً — ${remaining}! شارك الآن قبل فوات الأوان 🔥`,
        type: "auto",
      });
    }

    // ── مسابقات سريعة منتهية: الفائز بلقب "بطل السرعة ⚡" ──
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
        text: `🏆 بطل السرعة ⚡ في مسابقة "${comp.title}": ${top.roleLabel} ${top.name}${top.score ? ` — النتيجة: ${toAr(top.score)}` : ""} — الوقت: ${top.time}`,
        type: "auto",
      });
    }

    // ── مسابقات مفتوحة (بدون تاريخ انتهاء): المتصدر ──
    const { data: openComps } = await supabase
      .from("competitions")
      .select("id, title, ends_at")
      .is("ends_at", null)
      .order("created_at", { ascending: false })
      .limit(5);

    for (const comp of (openComps || [])) {
      const top = await getTopSubmission(comp.id);
      if (!top) continue;
      items.push({
        id: `comp-open-${comp.id}`,
        text: `🏆 متصدر مسابقة "${comp.title}": ${top.roleLabel} ${top.name}${top.score ? ` — النتيجة: ${toAr(top.score)}` : ""}`,
        type: "auto",
      });
    }

    // ── مسابقات نشطة: المتصدر الحالي ──
    const { data: activeComps } = await supabase
      .from("competitions")
      .select("id, title, ends_at")
      .gt("ends_at", twoDaysFromNow)
      .order("ends_at", { ascending: true })
      .limit(3);

    for (const comp of (activeComps || [])) {
      const top = await getTopSubmission(comp.id);
      if (!top) continue;
      items.push({
        id: `comp-active-${comp.id}`,
        text: `⚡ المتصدر حالياً في مسابقة "${comp.title}": ${top.roleLabel} ${top.name}${top.score ? ` — ${toAr(top.score)}` : ""} — المسابقة لا تزال نشطة!`,
        type: "auto",
      });
    }

    // ── معارض أُنشئت اليوم ──
    const { data: newGallery } = await supabase
      .from("gallery_contests")
      .select("id, title, created_at, ends_at")
      .gte("created_at", todayStartISO)
      .order("created_at", { ascending: false })
      .limit(3);

    for (const gc of (newGallery || [])) {
      items.push({
        id: `gallery-new-${gc.id}`,
        text: `🎨 مسابقة معرض جديدة: "${gc.title}" — شارك بإبداعك الآن وفز بلقب نجم المعرض 🌟`,
        type: "auto",
      });
    }

    // ── تذكير انتهاء معارض (خلال يومين) ──
    const { data: endingSoonGallery } = await supabase
      .from("gallery_contests")
      .select("id, title, ends_at")
      .gt("ends_at", now)
      .lte("ends_at", twoDaysFromNow)
      .order("ends_at", { ascending: true })
      .limit(3);

    for (const gc of (endingSoonGallery || [])) {
      const endsDate = new Date(gc.ends_at);
      const diffMs = endsDate.getTime() - Date.now();
      const diffHours = Math.floor(diffMs / (1000 * 3600));
      const diffMins = Math.floor((diffMs % (1000 * 3600)) / 60000);
      let remaining = "";
      if (diffHours >= 24) {
        const days = Math.floor(diffHours / 24);
        remaining = `فاضل ${days} يوم`;
      } else if (diffHours > 0) {
        remaining = `فاضل ${diffHours} ساعة و${diffMins} دقيقة`;
      } else {
        remaining = `فاضل ${diffMins} دقيقة فقط`;
      }
      items.push({
        id: `gallery-ending-${gc.id}`,
        text: `⏰ تذكير: مسابقة معرض "${gc.title}" تنتهي قريباً — ${remaining}! صوّت لأفضل عمل الآن 🎨`,
        type: "auto",
      });
    }

    // ── معارض منتهية: الفائز بلقب "نجم المعرض 🌟" ──
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
        text: `🌟 نجم المعرض في مسابقة "${gc.title}": ${leader.roleLabel} ${leader.name} — ${leader.votes} ❤`,
        type: "auto",
      });
    }

    // ── معارض نشطة: أكثر عمل حصل على لايكات الآن ──
    const { data: activeGallery } = await supabase
      .from("gallery_contests")
      .select("id, title, ends_at")
      .gt("ends_at", twoDaysFromNow)
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

const DURATION_OPTIONS = [
  { label: "يوم واحد", days: 1 },
  { label: "3 أيام", days: 3 },
  { label: "أسبوع", days: 7 },
  { label: "بلا انتهاء", days: 0 },
];

export function NewsTicker({ userId, canManage }: { userId: string | null; canManage: boolean }) {
  const [items, setItems] = useState<TickerItem[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newText, setNewText] = useState("");
  const [durationDays, setDurationDays] = useState(3);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const refresh = async () => {
    const auto = await fetchAutoItems();
    const custom = loadCustomItems();
    setItems([...custom, ...auto]);
  };

  // Broadcast a badge award into the ticker (1-day expiry)
  const broadcastBadgeAward = async (badgeRecord: any) => {
    try {
      const [{ data: prof }, { data: badge }] = await Promise.all([
        supabase.from("profiles").select("display_name").eq("id", badgeRecord.user_id).maybeSingle(),
        supabase.from("badges").select("name").eq("id", badgeRecord.badge_id).maybeSingle(),
      ]);
      const studentName = (prof as any)?.display_name || "طالب";
      const badgeName = (badge as any)?.name || "شارة";
      const item: TickerItem = {
        id: `badge-${badgeRecord.id}-${Date.now()}`,
        text: `🏅 تهانينا! ${studentName} حصل على شارة "${badgeName}"`,
        type: "custom",
        expires_at: daysFromNow(1),
      };
      const existing = loadCustomItems();
      if (!existing.some((x) => x.id === item.id)) {
        saveCustomItems([item, ...existing]);
        setItems((prev) => prev.some((x) => x.id === item.id) ? prev : [item, ...prev]);
        channelRef.current?.send({ type: "broadcast", event: "new_item", payload: item });
      }
    } catch {}
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 60 * 1000);

    channelRef.current = supabase
      .channel(TICKER_CHANNEL)
      .on("broadcast", { event: "new_item" }, ({ payload }: any) => {
        const incoming = payload as TickerItem;
        setItems((prev) => {
          if (prev.some((x) => x.id === incoming.id)) return prev;
          if (incoming.type === "custom") {
            const existing = loadCustomItems();
            if (!existing.some((x) => x.id === incoming.id)) {
              saveCustomItems([incoming, ...existing]);
            }
          }
          return [incoming, ...prev];
        });
      })
      .on("broadcast", { event: "remove_item" }, ({ payload }: any) => {
        const updated = loadCustomItems().filter((x) => x.id !== payload.id);
        saveCustomItems(updated);
        setItems((prev) => prev.filter((x) => x.id !== payload.id));
      })
      .subscribe();

    // Auto-refresh ticker when new submissions, votes, or events land
    // Also listen for new badge awards → auto-announce for 1 day
    const subsCh = supabase
      .channel("ticker-subs-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "competition_submissions" }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "gallery_contest_votes" }, () => refresh())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "events" }, () => refresh())
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "events" }, () => refresh())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "user_badges" }, (p: any) => {
        broadcastBadgeAward(p.new);
      })
      .subscribe();

    return () => {
      clearInterval(interval);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      supabase.removeChannel(subsCh);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addItem = () => {
    const text = newText.trim();
    if (!text) return;
    const item: TickerItem = {
      id: `custom-${Date.now()}`,
      text,
      type: "custom",
      expires_at: durationDays > 0 ? daysFromNow(durationDays) : undefined,
    };
    const updated = [item, ...loadCustomItems()];
    saveCustomItems(updated);
    setItems((prev) => [item, ...prev]);
    channelRef.current?.send({ type: "broadcast", event: "new_item", payload: item });
    const durationLabel = DURATION_OPTIONS.find((d) => d.days === durationDays)?.label || "";
    toast.success(`تمت إضافة الإعلان للشريط${durationLabel ? ` (${durationLabel})` : ""} ✅`);
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

  // Always render the bar so the fixed-top height stays consistent (avoids layout shift).
  // Teachers/supervisors see the "add" button even when empty; others see a welcome message.

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

            <div className="mb-3">
              <div className="text-xs text-muted-foreground font-bold mb-1.5">مدة الظهور:</div>
              <div className="flex gap-1.5 flex-wrap">
                {DURATION_OPTIONS.map((opt) => (
                  <button
                    key={opt.days}
                    onClick={() => setDurationDays(opt.days)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold border transition ${
                      durationDays === opt.days
                        ? "bg-amber-500 text-white border-amber-500"
                        : "bg-secondary border-border hover:border-amber-400"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

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
                  الإعلانات الحالية ({toAr(customItems.length)}):
                </div>
                {customItems.map((it) => (
                  <div
                    key={it.id}
                    className="flex items-center gap-2 text-xs bg-secondary/60 rounded-xl px-3 py-2"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{it.text}</div>
                      {it.expires_at && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          ينتهي: {new Date(it.expires_at).toLocaleDateString("ar-EG")}
                        </div>
                      )}
                    </div>
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
