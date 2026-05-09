import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles } from "lucide-react";

type Badge = { id: string; badge_id: string; earned_at: string; name?: string; icon?: string; description?: string };

const FALLBACK: Record<string, { name: string; icon: string }> = {
  excellence: { name: "شارة التميز", icon: "🌟" },
  distinction: { name: "شارة التفوق", icon: "🏆" },
  participation: { name: "شارة المشاركة", icon: "🙋" },
  creativity: { name: "شارة الإبداع", icon: "🎨" },
  perseverance: { name: "شارة المثابرة", icon: "💪" },
  leadership: { name: "شارة القيادة", icon: "👑" },
  honor_student: { name: "طالب الأسبوع", icon: "🎖️" },
  helpful: { name: "شارة المساعد", icon: "🤝" },
  first_activity: { name: "أول نشاط", icon: "✨" },
  five_activities: { name: "5 أنشطة", icon: "🔥" },
  ten_activities: { name: "10 أنشطة", icon: "⚡" },
  competition_winner: { name: "بطل المسابقات", icon: "🥇" },
};

export function MyBadges({ uid }: { uid: string }) {
  const [list, setList] = useState<Badge[]>([]);

  useEffect(() => {
    (async () => {
      const { data: ub } = await supabase.from("user_badges").select("*").eq("user_id", uid).order("earned_at", { ascending: false });
      const ids = [...new Set((ub || []).map((b: any) => b.badge_id))];
      const { data: meta } = ids.length ? await supabase.from("badges").select("*").in("id", ids) : { data: [] };
      const map: Record<string, any> = {};
      (meta || []).forEach((m: any) => { map[m.id] = m; });
      // Group by badge_id and count duplicates
      const grouped: Record<string, Badge & { count: number }> = {};
      (ub || []).forEach((b: any) => {
        if (grouped[b.badge_id]) { grouped[b.badge_id].count += 1; return; }
        grouped[b.badge_id] = {
          ...b,
          count: 1,
          name: map[b.badge_id]?.name || FALLBACK[b.badge_id]?.name || b.badge_id,
          icon: map[b.badge_id]?.icon || FALLBACK[b.badge_id]?.icon || "🏅",
          description: map[b.badge_id]?.description,
        };
      });
      setList(Object.values(grouped));
    })();
  }, [uid]);

  if (list.length === 0) return null;

  return (
    <div className="bg-card rounded-3xl border border-border p-6 shadow-[var(--shadow-card)] mt-6">
      <h3 className="font-bold mb-4 flex items-center gap-2"><Sparkles className="h-5 w-5 text-violet-500" /> شاراتي ({list.length})</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {list.map((b: any) => (
          <div key={b.id} className="rounded-2xl border-2 border-violet-200 bg-gradient-to-br from-violet-50 via-fuchsia-50 to-pink-50 p-4 text-center relative">
            {b.count > 1 && (
              <span className="absolute top-2 left-2 text-[10px] font-black px-2 py-0.5 rounded-full bg-violet-600 text-white">×{b.count}</span>
            )}
            <div className="text-4xl mb-2">{b.icon}</div>
            <div className="font-black text-sm text-violet-900">{b.name}</div>
            {b.description && <div className="text-[11px] text-violet-700 mt-1">{b.description}</div>}
            <div className="text-[10px] text-violet-600 mt-2 border-t border-violet-200 pt-1">
              {b.count > 1 ? `حصلت عليها ${b.count} مرات` : new Date(b.earned_at).toLocaleDateString("ar")}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
