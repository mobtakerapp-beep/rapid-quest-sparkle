import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Crown, Star, Zap } from "lucide-react";
import { Link } from "@tanstack/react-router";

type Hero = {
  name: string;
  role: string;
  points: number;
  avatar?: string | null;
  activity: string;
};

function getRoleLabel(r: string) {
  return r === "teacher" ? "المعلم" : r === "student" ? "الطالب" : r === "supervisor" ? "المشرف" : r === "admin" ? "المشرف العام" : "";
}

export function HeroOfDay() {
  const [hero, setHero] = useState<Hero | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const { data: subs } = await supabase
        .from("competition_submissions")
        .select("user_id")
        .gte("created_at", todayStart.toISOString());

      const { data: attempts } = await supabase
        .from("quiz_attempts")
        .select("user_id")
        .gte("created_at", todayStart.toISOString());

      const counts: Record<string, number> = {};
      (subs || []).forEach((s: any) => { counts[s.user_id] = (counts[s.user_id] || 0) + 2; });
      (attempts || []).forEach((a: any) => { counts[a.user_id] = (counts[a.user_id] || 0) + 1; });

      let topId: string | null = null;
      let topScore = 0;
      for (const [id, score] of Object.entries(counts)) {
        if (score > topScore) { topId = id; topScore = score; }
      }

      if (!topId) {
        const { data: top } = await supabase
          .from("profiles")
          .select("id, display_name, role_type, points, avatar_url")
          .order("points", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (top && top.points > 0) {
          setHero({
            name: (top as any).display_name || "—",
            role: getRoleLabel((top as any).role_type),
            points: (top as any).points || 0,
            avatar: (top as any).avatar_url,
            activity: "الأعلى نقاطاً",
          });
        }
        setLoading(false);
        return;
      }

      const { data: prof } = await supabase
        .from("profiles")
        .select("display_name, role_type, points, avatar_url")
        .eq("id", topId)
        .maybeSingle();

      setHero({
        name: (prof as any)?.display_name || "—",
        role: getRoleLabel((prof as any)?.role_type),
        points: (prof as any)?.points || 0,
        avatar: (prof as any)?.avatar_url,
        activity: "الأكثر نشاطاً اليوم",
      });
      setLoading(false);
    })();
  }, []);

  if (loading) return (
    <section className="container mx-auto px-6 pb-6" dir="rtl">
      <div className="h-28 rounded-3xl bg-secondary animate-pulse" />
    </section>
  );
  if (!hero) return null;

  return (
    <section className="container mx-auto px-6 pb-8" dir="rtl">
      <Link to="/leaderboard" className="block group">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-amber-500 via-yellow-400 to-orange-500 p-[2px] shadow-lg hover:shadow-xl transition-shadow">
          <div className="relative rounded-[22px] bg-card px-6 py-5 flex items-center gap-5">
            <div className="absolute inset-0 bg-gradient-to-r from-amber-50/40 via-yellow-50/20 to-transparent dark:from-amber-900/20 dark:via-transparent rounded-[22px]" />

            <div className="relative shrink-0">
              <div className="h-14 w-14 rounded-2xl overflow-hidden ring-2 ring-amber-400 shadow-md">
                {hero.avatar ? (
                  <img src={hero.avatar} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                    <Crown className="h-7 w-7 text-white" />
                  </div>
                )}
              </div>
              <span className="absolute -bottom-1 -right-1 h-5 w-5 bg-amber-500 rounded-full flex items-center justify-center shadow">
                <Crown className="h-3 w-3 text-white" />
              </span>
            </div>

            <div className="relative flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] font-bold bg-amber-500 text-white px-2 py-0.5 rounded-full">
                  🏅 {hero.activity}
                </span>
              </div>
              <div className="font-black text-base text-foreground truncate" style={{ fontFamily: "'Tajawal','Cairo',sans-serif" }}>
                {hero.role && <span className="text-amber-600 dark:text-amber-400 ml-1">{hero.role}</span>}
                {hero.name}
              </div>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
                  {hero.points.toLocaleString("ar-EG")} نقطة
                </span>
                <span className="text-xs text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1 group-hover:underline">
                  <Zap className="h-3 w-3" /> عرض اللوحة الكاملة
                </span>
              </div>
            </div>
          </div>
        </div>
      </Link>
    </section>
  );
}
