import { useEffect, useState } from "react";
import { toAr } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Crown, Star, GraduationCap, BookOpen } from "lucide-react";

type Top = { id: string; display_name: string | null; points: number; school: string | null; gender: string | null };

export function HonorBoard() {
  const [topStudent, setTopStudent] = useState<Top | null>(null);
  const [topTeacher, setTopTeacher] = useState<Top | null>(null);

  const load = async () => {
    const [{ data: students }, { data: teachers }] = await Promise.all([
      supabase.from("profiles").select("id, display_name, points, school, gender, role_type")
        .or("role_type.is.null,role_type.eq.student")
        .order("points", { ascending: false }).limit(1),
      supabase.from("profiles").select("id, display_name, points, school, gender, role_type")
        .in("role_type", ["teacher", "supervisor", "admin"])
        .order("points", { ascending: false }).limit(1),
    ]);
    setTopStudent((students?.[0] as any) || null);
    setTopTeacher((teachers?.[0] as any) || null);
  };

  useEffect(() => {
    load();
    const ch = supabase.channel("honor-board-rt")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  if (!topStudent && !topTeacher) return null;

  const Card = ({ p, kind }: { p: Top; kind: "student" | "teacher" }) => {
    const isTeacher = kind === "teacher";
    const isFemale = p.gender === "female";
    const title = isTeacher
      ? (isFemale ? "المعلمة المتميزة الأكثر نشاطاً" : "المعلم المتميز الأكثر نشاط")
      : (isFemale ? "الطالبة المتميزة الأكثر نشاطاً" : "الطالب المتميز الأكثر نشاطاً");

    const borderColor = isTeacher ? "border-violet-300" : "border-amber-300";
    const bgGrad = isTeacher
      ? "from-violet-50 to-fuchsia-50 dark:from-violet-950/20 dark:to-fuchsia-950/10"
      : "from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/10";
    const iconGrad = isTeacher ? "from-violet-500 to-fuchsia-500" : "from-amber-400 to-orange-500";
    const tagColor = isTeacher ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
    const titleColor = isTeacher ? "text-violet-700 dark:text-violet-300" : "text-amber-700 dark:text-amber-400";
    const Icon = isTeacher ? GraduationCap : BookOpen;

    return (
      <div className={`relative bg-gradient-to-br ${bgGrad} rounded-2xl border-2 ${borderColor} px-4 py-3 flex items-center gap-3 overflow-hidden shadow-sm`}>
        <div className={`h-10 w-10 rounded-xl bg-gradient-to-br ${iconGrad} flex items-center justify-center text-white shadow-md shrink-0`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0 text-right">
          <div className={`text-[10px] font-bold inline-flex items-center gap-1 mb-0.5 ${titleColor}`}>
            <Crown className="h-3 w-3" /> {title}
          </div>
          <div className="font-black text-sm truncate">{p.display_name || "—"}</div>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-bold ${tagColor}`}>
              <Star className="h-3 w-3" /> {toAr(p.points)} نقطة
            </span>
            {p.school && <span className="text-[10px] text-muted-foreground truncate">{p.school}</span>}
          </div>
        </div>
      </div>
    );
  };

  return (
    <section className="container mx-auto px-6 pb-8" dir="rtl">
      <div className="text-center mb-3">
        <h2 className="text-lg md:text-xl font-black inline-flex items-center gap-2">
          <Crown className="h-5 w-5 text-amber-500" /> لوحة الشرف
        </h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl mx-auto">
        {topStudent && <Card p={topStudent} kind="student" />}
        {topTeacher && <Card p={topTeacher} kind="teacher" />}
      </div>
    </section>
  );
}
