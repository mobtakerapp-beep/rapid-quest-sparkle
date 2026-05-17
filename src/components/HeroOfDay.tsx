import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Crown, Star, Zap, GraduationCap, BookOpen } from "lucide-react";
import { Link } from "@tanstack/react-router";

type Hero = {
  name: string;
  points: number;
  avatar?: string | null;
  activity: string;
  gender?: string | null;
};

export function HeroOfDay() {
  const [heroStudent, setHeroStudent] = useState<Hero | null>(null);
  const [heroTeacher, setHeroTeacher] = useState<Hero | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const [{ data: subs }, { data: attempts }] = await Promise.all([
        supabase.from("competition_submissions").select("user_id").gte("created_at", todayStart.toISOString()),
        supabase.from("quiz_attempts").select("user_id").gte("created_at", todayStart.toISOString()),
      ]);

      const counts: Record<string, number> = {};
      (subs || []).forEach((s: any) => { counts[s.user_id] = (counts[s.user_id] || 0) + 2; });
      (attempts || []).forEach((a: any) => { counts[a.user_id] = (counts[a.user_id] || 0) + 1; });

      const sortedIds = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([id]) => id);

      const [{ data: studentProfiles }, { data: teacherProfiles }] = await Promise.all([
        supabase.from("profiles").select("id, display_name, points, avatar_url, gender, role_type")
          .or("role_type.is.null,role_type.eq.student")
          .order("points", { ascending: false }).limit(50),
        supabase.from("profiles").select("id, display_name, points, avatar_url, gender, role_type")
          .in("role_type", ["teacher", "supervisor", "admin"])
          .order("points", { ascending: false }).limit(50),
      ]);

      const pickHero = (profiles: any[], label: string): Hero | null => {
        if (!profiles || profiles.length === 0) return null;
        // Prefer today's most active user from this group
        for (const id of sortedIds) {
          const p = profiles.find((x: any) => x.id === id);
          if (p) {
            return { name: p.display_name || "—", points: p.points || 0, avatar: p.avatar_url, activity: "الأكثر نشاطاً اليوم", gender: p.gender };
          }
        }
        // Fallback: highest points in group
        const top = profiles[0];
        if (!top || top.points === 0) return null;
        return { name: top.display_name || "—", points: top.points || 0, avatar: top.avatar_url, activity: "الأعلى نقاطاً", gender: top.gender };
      };

      setHeroStudent(pickHero(studentProfiles || [], "student"));
      setHeroTeacher(pickHero(teacherProfiles || [], "teacher"));
      setLoading(false);
    })();
  }, []);

  if (loading) return (
    <section className="container mx-auto px-6 pb-6" dir="rtl">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl mx-auto">
        <div className="h-28 rounded-3xl bg-secondary animate-pulse" />
        <div className="h-28 rounded-3xl bg-secondary animate-pulse" />
      </div>
    </section>
  );

  if (!heroStudent && !heroTeacher) return null;

  const Card = ({ hero, kind }: { hero: Hero; kind: "student" | "teacher" }) => {
    const isTeacher = kind === "teacher";
    const gradBorder = isTeacher ? "from-violet-500 via-fuchsia-400 to-purple-500" : "from-amber-500 via-yellow-400 to-orange-500";
    const gradBg = isTeacher ? "from-violet-50/40 via-fuchsia-50/20 to-transparent dark:from-violet-900/20" : "from-amber-50/40 via-yellow-50/20 to-transparent dark:from-amber-900/20";
    const avatarGrad = isTeacher ? "from-violet-400 to-fuchsia-500" : "from-amber-400 to-orange-500";
    const badgeBg = isTeacher ? "bg-violet-500" : "bg-amber-500";
    const ringColor = isTeacher ? "ring-violet-400" : "ring-amber-400";
    const badgeIconBg = isTeacher ? "bg-violet-500" : "bg-amber-500";
    const pointsColor = isTeacher ? "text-violet-600 dark:text-violet-400" : "text-amber-600 dark:text-amber-400";
    const titleLabel = isTeacher
      ? (hero.gender === "female" ? "المعلمة الأكثر نشاطاً" : "المعلم الأكثر نشاطاً")
      : (hero.gender === "female" ? "الطالبة الأكثر نشاطاً" : "الطالب الأكثر نشاطاً");

    return (
      <Link to="/leaderboard" className="block group">
        <div className={`relative overflow-hidden rounded-3xl bg-gradient-to-r ${gradBorder} p-[2px] shadow-lg hover:shadow-xl transition-shadow`}>
          <div className="relative rounded-[22px] bg-card px-5 py-4 flex items-center gap-4">
            <div className={`absolute inset-0 bg-gradient-to-r ${gradBg} rounded-[22px]`} />
            <div className="relative shrink-0">
              <div className={`h-13 w-13 rounded-2xl overflow-hidden ring-2 ${ringColor} shadow-md h-12 w-12`}>
                {hero.avatar ? (
                  <img src={hero.avatar} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className={`h-full w-full bg-gradient-to-br ${avatarGrad} flex items-center justify-center`}>
                    {isTeacher ? <GraduationCap className="h-6 w-6 text-white" /> : <BookOpen className="h-6 w-6 text-white" />}
                  </div>
                )}
              </div>
              <span className={`absolute -bottom-1 -right-1 h-5 w-5 ${badgeIconBg} rounded-full flex items-center justify-center shadow`}>
                <Crown className="h-3 w-3 text-white" />
              </span>
            </div>
            <div className="relative flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className={`text-[10px] font-bold ${badgeBg} text-white px-2 py-0.5 rounded-full`}>
                  🏅 {hero.activity}
                </span>
              </div>
              <div className="font-black text-sm text-foreground truncate" style={{ fontFamily: "'Tajawal','Cairo',sans-serif" }}>
                <span className={`${pointsColor} ml-1 text-[11px]`}>{titleLabel}</span>
                <div className="truncate">{hero.name}</div>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
                  {hero.points.toLocaleString("ar-EG")} نقطة
                </span>
                <span className={`text-xs ${pointsColor} font-bold flex items-center gap-1 group-hover:underline`}>
                  <Zap className="h-3 w-3" /> اللوحة
                </span>
              </div>
            </div>
          </div>
        </div>
      </Link>
    );
  };

  return (
    <section className="container mx-auto px-6 pb-8" dir="rtl">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl mx-auto">
        {heroStudent && <Card hero={heroStudent} kind="student" />}
        {heroTeacher && <Card hero={heroTeacher} kind="teacher" />}
      </div>
    </section>
  );
}
