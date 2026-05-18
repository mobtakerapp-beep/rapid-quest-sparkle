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

function endOfToday(): string {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
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

// ── الأحداث الوطنية الميلادية ──
const GREGORIAN_EVENTS: { month: number; day: number; text: string }[] = [
  { month: 11, day: 18, text: "🎉 تهانينا بمناسبة العيد الوطني لسلطنة عُمان — كل عام وعُمان بألف خير 🇴🇲" },
  { month: 11, day: 19, text: "🎉 تهانينا بمناسبة العيد الوطني لسلطنة عُمان — يوم المجد والعطاء 🇴🇲" },
  { month: 1,  day: 1,  text: "🌟 كل عام وأنتم بخير بمناسبة العام الميلادي الجديد — عام مليء بالتعلم والإنجاز ✨" },
  { month: 4,  day: 23, text: "🌍 تهانينا بمناسبة يوم الأرض — نحافظ على بيئتنا لأجيالنا القادمة 🌱" },
];

// ── الأحداث الإسلامية بالتاريخ الهجري ──
// month: 1=محرم, 2=صفر, 3=ربيع الأول, ... 9=رمضان, 10=شوال, 12=ذو الحجة
const HIJRI_EVENTS: { month: number; day: number; text: string }[] = [
  { month: 1,  day: 1,  text: "🌙 كل عام وأنتم بخير بمناسبة رأس السنة الهجرية — عام هجري جديد مبارك على الجميع 🌙" },
  { month: 1,  day: 10, text: "🕌 يوم عاشوراء المبارك — تقبّل الله صيامكم وأعمالكم الصالحة" },
  { month: 3,  day: 12, text: "🕌 تهانينا بمناسبة ذكرى المولد النبوي الشريف — اللهم صلِّ على سيدنا محمد ﷺ" },
  { month: 7,  day: 27, text: "🌙 تهانينا بمناسبة ليلة الإسراء والمعراج — ليلة مباركة على الأمة الإسلامية جمعاء" },
  { month: 8,  day: 15, text: "🌟 ليلة النصف من شعبان — تقبّل الله طاعاتكم وأعمالكم الصالحة" },
  { month: 9,  day: 1,  text: "🌙 رمضان كريم — كل عام وأنتم بخير، رمضان مبارك على الجميع 🌙" },
  { month: 9,  day: 27, text: "✨ ليلة القدر المباركة — خيرٌ من ألف شهر، تقبّل الله قيامكم وصيامكم" },
  { month: 10, day: 1,  text: "🎉 عيد الفطر المبارك — كل عام وأنتم بخير، تقبّل الله منّا ومنكم صالح الأعمال 🌙" },
  { month: 10, day: 2,  text: "🎉 أيام العيد — عيد الفطر المبارك، كل عام وأنتم بخير وسعادة 😊" },
  { month: 10, day: 3,  text: "🎉 أيام العيد — كل عام وأنتم بخير، أطال الله أعماركم بالخير والعافية" },
  { month: 12, day: 1,  text: "🕌 بداية أيام ذي الحجة المباركة — كل عام وأنتم بخير، اللهم تقبّل من الحجاج 🕋" },
  { month: 12, day: 9,  text: "🕋 يوم عرفة المبارك — أعظم أيام السنة، اللهم اغفر لنا وتقبّل دعاءنا" },
  { month: 12, day: 10, text: "🎉 عيد الأضحى المبارك — كل عام وأنتم بخير، تقبّل الله منّا ومنكم صالح الأعمال 🐑" },
  { month: 12, day: 11, text: "🎉 أيام التشريق — عيد الأضحى المبارك، كل عام وأنتم بخير وبركة" },
  { month: 12, day: 12, text: "🎉 أيام التشريق — كل عام وأنتم بخير، أيام أكل وشرب وذكر لله" },
  { month: 12, day: 13, text: "🎉 آخر أيام التشريق — كل عام وأنتم بخير، تقبّل الله منّا ومنكم" },
];

function getHijriDate(): { month: number; day: number } {
  // ar-OM-u-ca-islamic-umalqura = Oman Umm al-Qura calendar (matches GlobalNav.tsx display)
  const tryLocales = [
    "ar-OM-u-ca-islamic-umalqura",
    "ar-SA-u-ca-islamic-umalqura",
    "en-u-ca-islamic-umalqura",
    "ar-OM-u-ca-islamic",
  ];
  for (const locale of tryLocales) {
    try {
      const fmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "numeric" });
      const parts = fmt.formatToParts(new Date());
      const month = parseInt(parts.find((p) => p.type === "month")?.value || "0", 10);
      const day   = parseInt(parts.find((p) => p.type === "day")?.value   || "0", 10);
      if (month > 0 && day > 0) return { month, day };
    } catch { /* try next locale */ }
  }
  return { month: 0, day: 0 };
}

function getOmanNationalEvents(): TickerItem[] {
  const now = new Date();
  const gm = now.getMonth() + 1;
  const gd = now.getDate();
  const { month: hm, day: hd } = getHijriDate();

  const gregorianItems = GREGORIAN_EVENTS
    .filter((e) => e.month === gm && e.day === gd)
    .map((e, i) => ({ id: `national-g-${gm}-${gd}-${i}`, text: e.text, type: "auto" as const }));

  const hijriItems = HIJRI_EVENTS
    .filter((e) => e.month === hm && e.day === hd)
    .map((e, i) => ({ id: `national-h-${hm}-${hd}-${i}`, text: e.text, type: "auto" as const }));

  return [...gregorianItems, ...hijriItems];
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

    // ── مسابقات نشطة حالياً (تبقى حتى انتهاء وقتها) ──
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
    const { data: newComps } = await supabase
      .from("competitions")
      .select("id, title, created_at, ends_at")
      .gte("created_at", threeDaysAgo)
      .or(`ends_at.is.null,ends_at.gt.${now}`)
      .order("created_at", { ascending: false })
      .limit(3);

    for (const comp of (newComps || [])) {
      const createdDate = new Date(comp.created_at);
      const isNew = Date.now() - createdDate.getTime() < 24 * 3600 * 1000;
      const label = isNew ? "⚡ مسابقة جديدة" : "⚡ مسابقة نشطة";
      items.push({
        id: `comp-new-${comp.id}`,
        text: `${label}: "${comp.title}" — شارك الآن وأثبت نفسك! 🏆`,
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

    // ── مسابقات سريعة منتهية (خلال آخر يومين): الفائز بلقب "بطل السرعة ⚡" ──
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString();
    const { data: endedComps } = await supabase
      .from("competitions")
      .select("id, title, ends_at")
      .lt("ends_at", now)
      .gte("ends_at", twoDaysAgo)
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

    // ── معارض نشطة حالياً (تبقى حتى انتهاء وقتها) ──
    const { data: newGallery } = await supabase
      .from("gallery_contests")
      .select("id, title, created_at, ends_at")
      .gte("created_at", threeDaysAgo)
      .or(`ends_at.is.null,ends_at.gt.${now}`)
      .order("created_at", { ascending: false })
      .limit(3);

    for (const gc of (newGallery || [])) {
      const createdDate = new Date(gc.created_at);
      const isNew = Date.now() - createdDate.getTime() < 24 * 3600 * 1000;
      const label = isNew ? "🎨 معرض إبداعي جديد" : "🎨 معرض إبداعي نشط";
      items.push({
        id: `gallery-new-${gc.id}`,
        text: `${label}: "${gc.title}" — شارك بإبداعك واحصل على لقب نجم المعرض 🌟`,
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

    // ── أنشطة جديدة من المعلمين (آخر يومين) ──
    const { data: newActivities } = await supabase
      .from("activities")
      .select("id, title, user_id, subject, created_at")
      .gte("created_at", twoDaysAgo)
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(4);

    for (const act of (newActivities || [])) {
      const { data: poster } = await supabase.from("profiles").select("display_name, role_type").eq("id", act.user_id).maybeSingle();
      const isNew = Date.now() - new Date(act.created_at).getTime() < 24 * 3600 * 1000;
      const posterLabel = getRoleLabel((poster as any)?.role_type) || "المعلم";
      const posterName  = (poster as any)?.display_name || "—";
      items.push({
        id: `activity-${act.id}`,
        text: `📚 ${isNew ? "نشاط جديد" : "نشاط"} من ${posterLabel} ${posterName}: "${act.title}"${act.subject && act.subject !== "عام" ? ` — مادة: ${act.subject}` : ""} — تفضّل واطّلع عليه! 👈`,
        type: "auto",
      });
    }

    // ── واجبات جديدة (آخر يومين أو ما زال موعد تسليمها في المستقبل) ──
    const { data: newAssignments } = await supabase
      .from("assignments")
      .select("id, title, subject, due_at, created_at, teacher_id")
      .or(`created_at.gte.${twoDaysAgo},due_at.gt.${now}`)
      .order("created_at", { ascending: false })
      .limit(4);

    for (const asgn of (newAssignments || [])) {
      const { data: teacher } = await supabase.from("profiles").select("display_name, role_type").eq("id", asgn.teacher_id).maybeSingle();
      const teacherLabel = getRoleLabel((teacher as any)?.role_type) || "المعلم";
      const teacherName  = (teacher as any)?.display_name || "—";
      const isNew = Date.now() - new Date(asgn.created_at).getTime() < 24 * 3600 * 1000;
      let dueStr = "";
      if (asgn.due_at) {
        const dueDate = new Date(asgn.due_at);
        const diffMs = dueDate.getTime() - Date.now();
        const diffHours = Math.floor(diffMs / (1000 * 3600));
        if (diffMs < 0) {
          dueStr = " — انتهى موعد التسليم";
        } else if (diffHours < 24) {
          dueStr = ` — موعد التسليم اليوم الساعة ${dueDate.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })} ⏰`;
        } else if (diffHours < 48) {
          dueStr = ` — موعد التسليم غداً ⏰`;
        } else {
          dueStr = ` — موعد التسليم: ${dueDate.toLocaleDateString("ar-EG", { weekday: "short", month: "short", day: "numeric" })} 📅`;
        }
      }
      items.push({
        id: `assignment-${asgn.id}`,
        text: `📋 ${isNew ? "واجب جديد" : "واجب"} من ${teacherLabel} ${teacherName}: "${asgn.title}"${dueStr} — سلّمه في وقته! 💪`,
        type: "auto",
      });
    }

    // ── اختبارات جديدة (آخر يومين) ──
    const { data: newQuizzes } = await supabase
      .from("quizzes")
      .select("id, title, created_by, created_at")
      .gte("created_at", twoDaysAgo)
      .order("created_at", { ascending: false })
      .limit(4);

    for (const quiz of (newQuizzes || [])) {
      const { data: creator } = await supabase.from("profiles").select("display_name, role_type").eq("id", quiz.created_by).maybeSingle();
      const creatorLabel = getRoleLabel((creator as any)?.role_type) || "المعلم";
      const creatorName  = (creator as any)?.display_name || "—";
      const isNew = Date.now() - new Date(quiz.created_at).getTime() < 24 * 3600 * 1000;
      items.push({
        id: `quiz-${quiz.id}`,
        text: `🎯 ${isNew ? "اختبار جديد" : "اختبار"} من ${creatorLabel} ${creatorName}: "${quiz.title}" — شارك الآن واكسب نقاطاً! ⭐`,
        type: "auto",
      });
    }

    // ── فائزو الاختبارات (خلال آخر يومين) ──
    const { data: recentAttempts } = await supabase
      .from("quiz_attempts")
      .select("quiz_id, user_id, score, max_score, created_at")
      .gte("created_at", twoDaysAgo)
      .order("score", { ascending: false })
      .limit(50);

    if (recentAttempts?.length) {
      const quizIds = [...new Set((recentAttempts || []).map((a: any) => a.quiz_id))];
      const { data: quizDetails } = await supabase.from("quizzes").select("id, title").in("id", quizIds);
      const quizMap: Record<string, string> = {};
      (quizDetails || []).forEach((q: any) => { quizMap[q.id] = q.title; });

      // Group by quiz and pick top scorer per quiz
      const topPerQuiz: Record<string, any> = {};
      for (const attempt of (recentAttempts || [])) {
        const prev = topPerQuiz[attempt.quiz_id];
        const prevScore = prev ? (prev.score / (prev.max_score || 1)) : -1;
        const curScore  = (attempt as any).score / ((attempt as any).max_score || 1);
        if (!prev || curScore > prevScore) topPerQuiz[attempt.quiz_id] = attempt;
      }

      for (const [quizId, top] of Object.entries(topPerQuiz)) {
        const quizTitle = quizMap[quizId];
        if (!quizTitle) continue;
        const { data: winner } = await supabase.from("profiles").select("display_name, role_type").eq("id", (top as any).user_id).maybeSingle();
        if (!(winner as any)?.display_name) continue;
        const winnerLabel = getRoleLabel((winner as any)?.role_type) || "الطالب";
        const winnerName  = (winner as any)?.display_name;
        const scoreStr = (top as any).max_score ? `${toAr((top as any).score)}/${toAr((top as any).max_score)}` : `${toAr((top as any).score)}`;
        items.push({
          id: `quiz-winner-${quizId}`,
          text: `🏆 صاحب أعلى نتيجة في اختبار "${quizTitle}": ${winnerLabel} ${winnerName} — النتيجة: ${scoreStr} نقطة 🌟`,
          type: "auto",
        });
      }
    }

    // ── أكثر طالب ومعلم نشاطاً اليوم ──
    const todayActivityStart = new Date(); todayActivityStart.setHours(0, 0, 0, 0);
    const todayActivityISO = todayActivityStart.toISOString();

    const [
      { data: subsToday },
      { data: attemptsToday },
      { data: msgsToday },
      { data: stickersToday },
      { data: commentsToday },
    ] = await Promise.all([
      supabase.from("competition_submissions").select("user_id").gte("created_at", todayActivityISO),
      supabase.from("quiz_attempts").select("user_id").gte("created_at", todayActivityISO),
      supabase.from("messages").select("user_id").gte("created_at", todayActivityISO),
      (supabase as any).from("teacher_stickers").select("teacher_id").gte("created_at", todayActivityISO),
      supabase.from("activity_comments").select("user_id").gte("created_at", todayActivityISO),
    ]);

    // Build activity score per user (students: subs+attempts; teachers: msgs+stickers+comments)
    const activityScore: Record<string, number> = {};
    (subsToday     || []).forEach((s: any) => { activityScore[s.user_id]    = (activityScore[s.user_id]    || 0) + 2; });
    (attemptsToday || []).forEach((a: any) => { activityScore[a.user_id]    = (activityScore[a.user_id]    || 0) + 1; });
    (msgsToday     || []).forEach((m: any) => { activityScore[m.user_id]    = (activityScore[m.user_id]    || 0) + 1; });
    (stickersToday || []).forEach((s: any) => { activityScore[s.teacher_id] = (activityScore[s.teacher_id] || 0) + 3; });
    (commentsToday || []).forEach((c: any) => { activityScore[c.user_id]    = (activityScore[c.user_id]    || 0) + 1; });

    const activeUserIds = Object.keys(activityScore);
    if (activeUserIds.length > 0) {
      const { data: activeProfiles } = await supabase
        .from("profiles")
        .select("id, display_name, role_type, points")
        .in("id", activeUserIds);

      const byRole = (roles: string[]) => {
        const candidates = (activeProfiles || []).filter((p: any) => roles.includes(p.role_type));
        if (!candidates.length) return null;
        return candidates.reduce((best: any, p: any) =>
          (activityScore[p.id] || 0) > (activityScore[best.id] || 0) ? p : best
        );
      };

      const topStudent = byRole(["student"]);
      const topTeacher = byRole(["teacher", "supervisor", "admin"]);

      if (topStudent && topTeacher) {
        const sScore = activityScore[topStudent.id] || 0;
        const tScore = activityScore[topTeacher.id] || 0;
        const roleLabel = getRoleLabel(topTeacher.role_type);
        items.push({
          id: `active-top-today`,
          text: `⚡ أكثر نشاطاً اليوم — الطالب ${topStudent.display_name} (${sScore} نشاط) | ${roleLabel} ${topTeacher.display_name} (${tScore} نشاط)`,
          type: "auto",
        });
      } else if (topStudent) {
        const score = activityScore[topStudent.id] || 0;
        items.push({
          id: `active-student-today`,
          text: `⚡ أكثر طالب نشاطاً اليوم: الطالب ${topStudent.display_name} — ${score} نشاط`,
          type: "auto",
        });
      } else if (topTeacher) {
        const score = activityScore[topTeacher.id] || 0;
        const roleLabel = getRoleLabel(topTeacher.role_type);
        items.push({
          id: `active-teacher-today`,
          text: `⚡ أكثر ${roleLabel} نشاطاً اليوم: ${roleLabel} ${topTeacher.display_name} — ${score} نشاط`,
          type: "auto",
        });
      }
    }

    // ── متصدرو النقاط الكلية ──
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

  const pushTickerItem = (item: TickerItem) => {
    const existing = loadCustomItems();
    if (!existing.some((x) => x.id === item.id)) {
      saveCustomItems([item, ...existing]);
      setItems((prev) => prev.some((x) => x.id === item.id) ? prev : [item, ...prev]);
      channelRef.current?.send({ type: "broadcast", event: "new_item", payload: item });
    }
  };

  // Broadcast badge award — special "أول شارة" message if it's the user's very first
  const broadcastBadgeAward = async (badgeRecord: any) => {
    try {
      const queries: Promise<any>[] = [
        supabase.from("profiles").select("display_name, role_type, gender").eq("id", badgeRecord.user_id).maybeSingle(),
        supabase.from("badges").select("name").eq("id", badgeRecord.badge_id).maybeSingle(),
        supabase.from("user_badges").select("id", { count: "exact", head: true }).eq("user_id", badgeRecord.user_id),
      ];
      if (badgeRecord.awarded_by) {
        queries.push(supabase.from("profiles").select("display_name, role_type").eq("id", badgeRecord.awarded_by).maybeSingle() as any);
      }
      const results = await Promise.all(queries);
      const [{ data: prof }, { data: badge }, { count: badgeCount }] = results;
      const awarderData = badgeRecord.awarded_by ? (results[3] as any).data : null;

      const roleType    = (prof as any)?.role_type;
      const gender      = (prof as any)?.gender;
      const roleLabel   = getRoleLabel(roleType);
      const personName  = (prof as any)?.display_name || (roleLabel || "مستخدم");
      const badgeName   = (badge as any)?.name || "شارة";
      const verb        = gender === "female" ? "حصلت" : "حصل";
      const displayName = roleLabel ? `${roleLabel} ${personName}` : personName;
      const isFirst     = (badgeCount ?? 0) <= 1;

      let text: string;
      if (awarderData) {
        const awarderLabel = getRoleLabel((awarderData as any)?.role_type);
        const awarderName  = (awarderData as any)?.display_name || "معلم";
        const fromStr = awarderLabel ? `${awarderLabel} ${awarderName}` : awarderName;
        text = isFirst
          ? `🌟 أول شارة! أرسل ${fromStr} شارة "${badgeName}" إلى ${displayName} لأول مرة! 🎉🏅`
          : `🏅 أرسل ${fromStr} شارة "${badgeName}" إلى ${displayName} — مبروك! 🎉`;
      } else {
        text = isFirst
          ? `🌟 أول شارة! تهانينا لـ ${displayName} على الحصول على شارة "${badgeName}" لأول مرة! 🎉🏅`
          : `🏅 تهانينا! ${displayName} ${verb} على شارة "${badgeName}" 🎉`;
      }

      pushTickerItem({
        id: `badge-${badgeRecord.id}`,
        text,
        type: "custom",
        expires_at: endOfToday(),
      });
    } catch {}
  };

  // Broadcast sticker sent by teacher — shows all day
  const broadcastStickerSend = async (stickerRecord: any) => {
    try {
      const [{ data: teacher }, { data: recipient }] = await Promise.all([
        supabase.from("profiles").select("display_name, role_type").eq("id", stickerRecord.teacher_id).maybeSingle(),
        supabase.from("profiles").select("display_name, role_type").eq("id", stickerRecord.student_id).maybeSingle(),
      ]);
      const teacherLabel   = getRoleLabel((teacher as any)?.role_type);
      const teacherName    = (teacher as any)?.display_name || "معلم";
      const recipientLabel = getRoleLabel((recipient as any)?.role_type) || "الطالب";
      const recipientName  = (recipient as any)?.display_name || "مستخدم";
      const title          = stickerRecord.title || "ملصق تشجيعي";
      const fromStr = teacherLabel ? `${teacherLabel} ${teacherName}` : teacherName;
      const toStr   = `${recipientLabel} ${recipientName}`;
      pushTickerItem({
        id: `sticker-${stickerRecord.id}`,
        text: `🌟 أرسل ${fromStr} إلى ${toStr} ملصقاً: "${title}" — أحسنت! ✨`,
        type: "custom",
        expires_at: endOfToday(),
      });
    } catch {}
  };

  // Broadcast certificate issued by teacher — shows all day
  const broadcastCertificateIssue = async (certRecord: any) => {
    try {
      const [{ data: teacher }, { data: student }] = await Promise.all([
        supabase.from("profiles").select("display_name, role_type").eq("id", certRecord.teacher_id).maybeSingle(),
        supabase.from("profiles").select("display_name, role_type").eq("id", certRecord.student_id).maybeSingle(),
      ]);
      const teacherLabel = getRoleLabel((teacher as any)?.role_type);
      const teacherName  = (teacher as any)?.display_name || "معلم";
      const studentLabel = getRoleLabel((student as any)?.role_type) || "الطالب";
      const studentName  = (student as any)?.display_name || "طالب";
      const title        = certRecord.title || "شهادة تقدير";
      const fromStr = teacherLabel ? `${teacherLabel} ${teacherName}` : teacherName;
      const toStr   = `${studentLabel} ${studentName}`;
      pushTickerItem({
        id: `cert-${certRecord.id}`,
        text: `🎓 أرسل ${fromStr} إلى ${toStr} شهادة تقدير: "${title}" — مبروك! 🏆`,
        type: "custom",
        expires_at: endOfToday(),
      });
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

    // Auto-refresh ticker when new content lands
    // Listen for badges, stickers, certificates, activities, assignments, quizzes → auto-announce
    const subsCh = supabase
      .channel("ticker-subs-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "competition_submissions" }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "gallery_contest_votes" }, () => refresh())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "events" }, () => refresh())
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "events" }, () => refresh())
      // New activity/assignment/quiz → refresh immediately
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activities" }, () => refresh())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "assignments" }, () => refresh())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "quizzes" }, () => refresh())
      // Quiz completed → refresh to update winners
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "quiz_attempts" }, () => refresh())
      // Competitions/gallery created or updated
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "competitions" }, () => refresh())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "gallery_contests" }, () => refresh())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "user_badges" }, (p: any) => {
        broadcastBadgeAward(p.new);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "teacher_stickers" }, (p: any) => {
        broadcastStickerSend(p.new);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "certificates" }, (p: any) => {
        broadcastCertificateIssue(p.new);
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
