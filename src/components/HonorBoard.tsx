import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Crown, Star } from "lucide-react";

type Top = { id: string; display_name: string | null; points: number; avatar_url: string | null; school: string | null; gender: string | null };

export function HonorBoard() {
  const [topStudent, setTopStudent] = useState<Top | null>(null);
  const [topTeacher, setTopTeacher] = useState<Top | null>(null);

  const load = async () => {
    const [{ data: students }, { data: teachers }] = await Promise.all([
      supabase.from("profiles").select("id, display_name, points, avatar_url, school, gender, role_type")
        .or("role_type.is.null,role_type.eq.student")
        .order("points", { ascending: false }).limit(1),
      supabase.from("profiles").select("id, display_name, points, avatar_url, school, gender, role_type")
        .in("role_type", ["teacher", "supervisor", "admin"])
        .order("points", { ascending: false }).limit(1),
    ]);
    setTopStudent((students?.[0] as any) || null);
    setTopTeacher((teachers?.[0] as any) || null);
    // Update weekly winners (best-effort; no error toast)
    supabase.rpc("award_weekly_top").then(() => {});
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
    const title = kind === "teacher"
      ? (p.gender === "female" ? "المعلمة المتميزة" : "المعلم المتميز")
      : (p.gender === "female" ? "الطالبة المتميزة" : "الطالب المتميز");
    const grad = kind === "teacher" ? "from-violet-500 to-fuchsia-500" : "from-amber-400 to-orange-500";
    return (
      <div className="relative bg-card rounded-2xl border-2 border-amber-300 px-3 py-3 flex items-center gap-3 overflow-hidden shadow-sm">
        <div className={`relative h-12 w-12 rounded-full bg-gradient-to-br ${grad} flex items-center justify-center text-white text-lg font-black ring-2 ring-amber-200 shrink-0`}>
          {p.avatar_url ? <img src={p.avatar_url} alt="" className="h-full w-full object-cover rounded-full" /> : (p.display_name || "؟").charAt(0)}
        </div>
        <div className="flex-1 min-w-0 text-right">
          <div className="text-[10px] font-bold text-amber-700 inline-flex items-center gap-1">
            <Crown className="h-3 w-3" /> {title}
          </div>
          <div className="font-black text-sm truncate flex items-center gap-2 flex-wrap">
            <span className="truncate">{p.display_name || "—"}</span>
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[11px] font-bold">
              <Star className="h-3 w-3" /> {p.points}
            </span>
          </div>
          {p.school && <div className="text-[10px] text-muted-foreground truncate">{p.school}</div>}
        </div>
      </div>
    );
  };

  return (
    <section className="container mx-auto px-6 pb-8">
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
