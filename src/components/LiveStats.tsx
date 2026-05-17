import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Users, BookOpen, Trophy, Target } from "lucide-react";

type Stats = { students: number; activities: number; competitions: number; quizzes: number };

export function LiveStats() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    const load = async () => {
      const [
        { count: students },
        { count: activities },
        { count: competitions },
        { count: quizzes },
      ] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }).or("role_type.is.null,role_type.eq.student"),
        supabase.from("activities").select("id", { count: "exact", head: true }).eq("status", "approved"),
        supabase.from("competitions").select("id", { count: "exact", head: true }),
        supabase.from("quizzes").select("id", { count: "exact", head: true }),
      ]);
      setStats({
        students: students ?? 0,
        activities: activities ?? 0,
        competitions: competitions ?? 0,
        quizzes: quizzes ?? 0,
      });
    };
    load();
    const ch = supabase.channel("livestats-rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "profiles" }, load)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "profiles" }, load)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activities" }, load)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "activities" }, load)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "competitions" }, load)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "competitions" }, load)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "quizzes" }, load)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "quizzes" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const items = [
    { icon: Users, label: "طالب مشارك", value: stats?.students ?? null, color: "from-emerald-500 to-teal-500" },
    { icon: BookOpen, label: "نشاط تعليمي", value: stats?.activities ?? null, color: "from-blue-500 to-cyan-500" },
    { icon: Trophy, label: "مسابقة سريعة", value: stats?.competitions ?? null, color: "from-amber-500 to-orange-500" },
    { icon: Target, label: "اختبار تفاعلي", value: stats?.quizzes ?? null, color: "from-rose-500 to-pink-500" },
  ];

  return (
    <section className="container mx-auto px-6 pb-10" dir="rtl">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {items.map((item) => (
          <div
            key={item.label}
            className="relative bg-card rounded-2xl border border-border shadow-sm p-5 flex flex-col items-center gap-2 overflow-hidden group hover:shadow-md transition-shadow"
          >
            <div className={`h-11 w-11 rounded-xl bg-gradient-to-br ${item.color} flex items-center justify-center shadow-md group-hover:scale-110 transition-transform`}>
              <item.icon className="h-5 w-5 text-white" />
            </div>
            <div className="text-2xl font-black text-foreground tabular-nums">
              {item.value === null ? (
                <span className="inline-block h-7 w-10 rounded-lg bg-secondary animate-pulse" />
              ) : (
                item.value.toLocaleString("ar-EG")
              )}
            </div>
            <div className="text-xs text-muted-foreground font-medium text-center">{item.label}</div>
            <div className={`absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r ${item.color} opacity-60`} />
          </div>
        ))}
      </div>
    </section>
  );
}
